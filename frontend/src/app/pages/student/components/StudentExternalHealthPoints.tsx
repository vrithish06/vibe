import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { Loader2, ServerCrash } from 'lucide-react';
import { toast } from 'sonner';

export default function StudentExternalHealthPoints({ courseId }: { courseId: string }) {
    const [iframeUrl, setIframeUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        const fetchLaunchToken = async () => {
            try {
                const token = useAuthStore.getState().token;
                const res = await fetch(`${import.meta.env.VITE_BASE_URL}/lti/student-bp-launch/${courseId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                });
                const data = await res.json();
                if (data.success && data.launchUrl && data.token) {
                    const url = `${data.launchUrl}?lti_token=${data.token}&mode=bp_student`;
                    setIframeUrl(url);
                } else {
                    console.error('[BP Student Launch]', data.error);
                    setError(true);
                    toast.error('Failed to launch Brownie Points dashboard');
                }
            } catch (err) {
                console.error('[BP Student Launch] Failed:', err);
                setError(true);
                toast.error('Error launching Brownie Points dashboard');
            }
        };

        if (courseId) fetchLaunchToken();
    }, [courseId]);

    const handleIframeLoad = () => {
        setIsLoading(false);
    };

    if (error) {
        return (
            <div className="flex-1 w-full bg-background/50 h-full p-6 flex flex-col items-center justify-center text-center">
                <ServerCrash className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground max-w-sm">Failed to load your brownie points for this course.</p>
            </div>
        );
    }

    return (
        <div className="flex-1 w-full bg-background/50 h-full relative flex flex-col">
            {isLoading && !error && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        <p className="text-muted-foreground font-medium animate-pulse">Launching Brownie Points...</p>
                    </div>
                </div>
            )}
            
            {iframeUrl && (
                <iframe
                    src={iframeUrl}
                    title="Brownie Points Dashboard"
                    className="w-full h-full flex-1 border-0 min-h-[calc(100vh-100px)]"
                    onLoad={handleIframeLoad}
                    allow="same-origin"
                />
            )}
        </div>
    );
}
