
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

const BASE_URL = import.meta.env.VITE_BASE_URL;

const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('firebase-auth-token')}`
});

export function useCourseHealthPoints(courseId: string) {
    const [data, setData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!courseId) {
            setIsLoading(false);
            return;
        }
        try {
            setIsLoading(true);
            const res = await fetch(`${BASE_URL}/teacher/courses/healthPoints?courseId=${courseId}`, {
                headers: getHeaders()
            });
            if (!res.ok) throw new Error('Failed to fetch health points');
            const json = await res.json();
            setData(json);
        } catch (err: any) {
            console.error(err);
            setError(err.message);
            toast.error('Failed to load Health Points');
        } finally {
            setIsLoading(false);
        }
    }, [courseId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { data, isLoading, error, refetch: fetchData };
}

export function useStudentHealthPoints(courseId: string, studentId: string) {
    const [data, setData] = useState<{ healthPoints: any, events: any[] } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!courseId || !studentId) {
            setIsLoading(false);
            return;
        }
        try {
            setIsLoading(true);
            const res = await fetch(`${BASE_URL}/teacher/courses/healthPoints/student?courseId=${courseId}&studentId=${studentId}`, {
                headers: getHeaders()
            });
            if (!res.ok) throw new Error('Failed to fetch student details');
            const json = await res.json();
            setData(json);
        } catch (err: any) {
            console.error(err);
            setError(err.message);
            toast.error('Failed to load student details');
        } finally {
            setIsLoading(false);
        }
    }, [courseId, studentId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { data, isLoading, error, refetch: fetchData };
}

export function useAddHPEvent() {
    const [isPending, setIsPending] = useState(false);

    const mutate = async (body: {
        courseId: string;
        studentId: string;
        type: 'BONUS' | 'PENALTY' | 'MANUAL';
        percentageChange: number;
        reason: string;
    }) => {
        try {
            setIsPending(true);
            const res = await fetch(`${BASE_URL}/teacher/courses/healthPoints/events`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'Failed to add event');
            }

            toast.success('Health Points updated successfully');
            return await res.json();
        } catch (err: any) {
            console.error(err);
            toast.error(err.message);
            throw err;
        } finally {
            setIsPending(false);
        }
    };

    return { mutate, isPending };
}
