
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePairStatus } from "@/hooks/use-pair-status";
import { Task, TaskTag } from "@/types/Task";
import { mapDbTaskToAppTask } from "@/services/taskService";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();
  const { isPaired, pairData } = usePairStatus();

  // Function to refetch tasks from the database
  const refetchTasks = async () => {
    if (!user) return;
    
    try {
      console.log('🔄 Refetching tasks from database');
      await fetchTasks();
    } catch (err) {
      console.error('Error refetching tasks:', err);
    }
  };

  // Function to fetch tasks
  const fetchTasks = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('tasks')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      
      // If paired, filter by pair_id
      if (isPaired && pairData) {
        query = query.eq('pair_id', pairData.pair_id);
      } else {
        // If not paired, get tasks created by this user
        // This is a fallback to show individual tasks when not paired
        const { data: userPairs } = await supabase
          .from('pairs')
          .select('id')
          .eq('user_1_id', user.id)
          .is('user_2_id', null)
          .limit(1);
          
        if (userPairs && userPairs.length > 0) {
          query = query.eq('pair_id', userPairs[0].id);
        }
      }
      
      const { data, error: queryError } = await query;
      
      if (queryError) throw queryError;
      
      // Transform database tasks to app tasks using our mapping function
      setTasks((data || []).map(mapDbTaskToAppTask));
    } catch (err: any) {
      console.error('Error fetching tasks:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }

    fetchTasks();
    
    // Set up realtime subscription with improved filtering
    const channel = supabase
      .channel('tasks_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'tasks',
        filter: isPaired && pairData ? `pair_id=eq.${pairData.pair_id}` : undefined
      }, (payload) => {
        console.log('Tasks real-time update received:', payload);
        fetchTasks(); // Refresh the tasks immediately
      })
      .subscribe();
    
    return () => {
      channel.unsubscribe();
    };
  }, [user, isPaired, pairData]);
  
  return { tasks, loading, error, refetchTasks };
}
