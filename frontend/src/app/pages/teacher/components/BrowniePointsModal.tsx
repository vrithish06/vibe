"use client"

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface BrowniePointsModalProps {
  isOpen: boolean;
  onClose: () => void;
  launchUrl?: string;
  token?: string;
}

export function BrowniePointsModal({
  isOpen,
  onClose,
  launchUrl,
  token,
}: BrowniePointsModalProps) {
  const [iframeUrl, setIframeUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && launchUrl && token) {
      // Construct iframe URL with token and mode parameters
      const url = `${launchUrl}?lti_token=${token}&mode=bp_dashboard`;
      setIframeUrl(url);
      setIsLoading(true);
    }
  }, [isOpen, launchUrl, token]);

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[85vh] p-0 flex flex-col">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Manage Brownie Points</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 relative overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          
          {iframeUrl ? (
            <iframe
              src={iframeUrl}
              title="Brownie Points Dashboard"
              className="w-full h-full border-0"
              onLoad={handleIframeLoad}
              allow="same-origin"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
