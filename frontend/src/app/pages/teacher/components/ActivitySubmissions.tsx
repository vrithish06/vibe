import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, ExternalLink } from "lucide-react";
import { useAuthStore } from "@/store/auth-store";

interface ActivitySubmissionsProps {
  activityId: string;
  activityTitle: string;
  onClose: () => void;
}

export function ActivitySubmissions({ activityId, activityTitle, onClose }: ActivitySubmissionsProps) {
  const { token } = useAuthStore();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // A local map of student id to HP points to be awarded
  const [grades, setGrades] = useState<Record<string, number | "">>({});
  // Track previous HP values to show delta
  const [previousGrades, setPreviousGrades] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchSubmissions();
  }, [activityId]);

  const fetchSubmissions = async () => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_BASE_URL}/activities/${activityId}/submissions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error("Failed to fetch submissions");
      const data = await resp.json();
      setSubmissions(data);

      const initialGrades: Record<string, number | ""> = {};
      const previousGradeMap: Record<string, number> = {};
      data.forEach((s: any) => {
        initialGrades[s.userId] = s.hpAwarded ?? "";
        previousGradeMap[s.userId] = s.hpAwarded ?? 0;
      });
      setGrades(initialGrades);
      setPreviousGrades(previousGradeMap);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGradeChange = (userId: string, val: string) => {
    setGrades(prev => ({
      ...prev,
      [userId]: val === "" ? "" : Number(val)
    }));
  };

  const handeSaveAll = async () => {
    setIsSaving(true);
    try {
      const payload = Object.entries(grades)
        .filter(([_, v]) => typeof v === "number")
        .map(([k, v]) => ({ userId: k, hpAwarded: v }));

      const resp = await fetch(`${import.meta.env.VITE_BASE_URL}/activities/${activityId}/grade`, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ grades: payload })
      });
      if (!resp.ok) throw new Error("Failed to update grades");
      toast.success("Successfully updated HP for students");
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-4 md:p-6 border-b flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">Manage Submissions: {activityTitle}</h2>
            <p className="text-sm text-muted-foreground mt-1">Review student submissions and assign Health Points.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            ✕
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              No submissions yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Student Name</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Submitted At</th>
                    <th className="px-4 py-3 font-semibold text-center">Submission</th>
                    <th className="px-4 py-3 font-semibold w-32">HP to Award</th>
                    <th className="px-4 py-3 font-semibold w-32">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {submissions.map((sub, idx) => (
                    <tr key={idx} className="bg-white dark:bg-slate-900 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">
                        {sub.firstName} {sub.lastName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{sub.email}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(sub.submittedAt).toLocaleString(undefined, {
                            dateStyle: "medium", timeStyle: "short"
                        })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {sub.proofUrl ? (
                          <button 
                            onClick={async () => {
                              const newWin = window.open('', '_blank');
                              if (newWin) newWin.document.title = "Loading Document...";
                              try {
                                const resp = await fetch(`${import.meta.env.VITE_BASE_URL}/activities/proof/${sub.proofUrl}`, {
                                  headers: { Authorization: `Bearer ${token}` }
                                });
                                if (!resp.ok) throw new Error("Failed to load proof");
                                
                                const blob = await resp.blob();
                                const url = URL.createObjectURL(blob);
                                if (newWin) {
                                  newWin.location.href = url;
                                } else {
                                  window.open(url, '_blank');
                                }
                                setTimeout(() => URL.revokeObjectURL(url), 60000);
                              } catch(e: any) {
                                if (newWin) newWin.close();
                                toast.error(e.message);
                              }
                            }}
                            className="inline-flex items-center justify-center text-primary hover:underline gap-1 bg-primary/10 px-2 py-1 rounded"
                          >
                            <span>View</span> <ExternalLink className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">No file</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Input 
                          type="number" 
                          min="0"
                          value={grades[sub.userId] !== undefined ? grades[sub.userId] : ""}
                          onChange={(e) => handleGradeChange(sub.userId, e.target.value)}
                          placeholder="Points"
                          className="h-8 text-center"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {typeof grades[sub.userId] === 'number' ? (
                          <span className={`text-sm font-semibold ${
                            (grades[sub.userId] as number) - previousGrades[sub.userId] > 0 
                              ? 'text-green-600 dark:text-green-400' 
                              : (grades[sub.userId] as number) - previousGrades[sub.userId] < 0 
                              ? 'text-red-600 dark:text-red-400' 
                              : 'text-gray-500'
                          }`}>
                            {(grades[sub.userId] as number) - previousGrades[sub.userId] > 0 ? '+' : ''}{(grades[sub.userId] as number) - previousGrades[sub.userId]}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-4 md:p-6 border-t flex justify-end gap-3 bg-muted/10">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={handeSaveAll} disabled={isSaving || isLoading || submissions.length === 0}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save All Health Points"}
          </Button>
        </div>
      </div>
    </div>
  );
}
