import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Info } from "lucide-react";
import { useAuthStore } from '@/store/auth-store';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AddActivityProps {
    courseId: string;
    versionId: string;
    onSuccess: () => void;
    onCancel: () => void;
    initialData?: any;
}

export function AddActivity({ courseId, versionId, onSuccess, onCancel, initialData }: AddActivityProps) {
    const { token } = useAuthStore();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: initialData?.title || '',
        description: initialData?.description || '',
        activityType: initialData?.activityType || 'ASSIGNMENT',
        deadline: initialData?.deadline ? new Date(initialData.deadline).toISOString().slice(0, 16) : '',
        rewardType: initialData?.rewardType || 'ABSOLUTE',
        // Store numeric fields as strings so the number input works correctly
        // (prevents the "010" issue when the user types after a 0)
        rewardValue: String(initialData?.rewardValue ?? 10),
        mandatory: initialData?.mandatory ?? initialData?.isMandatory ?? false,
        penaltyType: initialData?.penaltyType || 'PERCENTAGE',
        penaltyValue: String(initialData?.penaltyValue ?? 0),
        submissionMode: initialData?.submissionMode || 'IN_PLATFORM',
        status: initialData?.status || 'PUBLISHED',
        isProofRequired: initialData?.isProofRequired ?? true, // default to true
        hpAssignmentMode: initialData?.hpAssignmentMode || 'AUTOMATIC',
        gracePeriodDuration: String(initialData?.gracePeriodDuration ?? 0),
        graceRewardPercentage: String(initialData?.graceRewardPercentage ?? 100),
        ltiToolId: initialData?.ltiToolId || '',
        ltiToolName: initialData?.ltiToolName || ''
    });

    React.useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'LTI_DEEP_LINK_SUCCESS') {
                const payload = event.data.payload;
                if (payload && payload.title) {
                    toast.success(`Success! Connected to external exam: ${payload.title}`);
                    setFormData(prev => ({
                        ...prev,
                        title: payload.title,
                        description: payload.text || prev.description,
                        ltiToolName: payload.title, // Auto-map the tool name to the test name
                    }));
                }
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value // always store as string; we convert on submit
        }));
    };

    const handleSelectChange = (name: string, value: string) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSwitchChange = (name: string, checked: boolean) => {
        setFormData(prev => ({ ...prev, [name]: checked }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.title || !formData.deadline) {
            toast.error("Please fill in all required fields (title, deadline)");
            return;
        }

        if (formData.activityType === 'LTI_TOOL' && !formData.ltiToolId) {
            toast.error("LTI Tool ID is required for External Tool (LTI) activities.");
            return;
        }

        setIsLoading(true);
        try {
            const endpoint = initialData ? `${import.meta.env.VITE_BASE_URL}/activities/${initialData._id || initialData.id}` : `${import.meta.env.VITE_BASE_URL}/activities`;
            const method = initialData ? 'PUT' : 'POST';

            // Clean up the body to avoid sending unnecessary fields to update
            const requestBody: any = {
                ...formData,
                isMandatory: formData.mandatory,
                mandatory: formData.mandatory,
                // Convert string-stored numeric fields back to numbers before sending
                rewardValue: Number(formData.rewardValue),
                gracePeriodDuration: Number(formData.gracePeriodDuration),
                graceRewardPercentage: Number(formData.graceRewardPercentage),
                deadline: new Date(formData.deadline).toISOString(),
                // Send null for penalty fields when mandatory is false to clear them in backend
                penaltyType: formData.mandatory ? formData.penaltyType : null,
                penaltyValue: formData.mandatory ? Number(formData.penaltyValue) : null,
            };

            // Only send parent IDs for new activities (POST)
            if (!initialData) {
                requestBody.courseId = courseId;
                requestBody.courseVersionId = versionId;
            }

            const response = await fetch(endpoint, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Failed to ${initialData ? 'update' : 'create'} activity`);
            }

            toast.success(`Activity ${initialData ? 'updated' : 'created'} successfully`);
            onSuccess();
        } catch (error: any) {
            console.error(error);
            toast.error(error.message || "Failed to create activity");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white dark:bg-background rounded-2xl shadow-lg border border-slate-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 md:p-6 lg:p-8">
                <div className="mb-6 pb-4 border-b border-slate-200 dark:border-gray-700">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-gray-100">{initialData ? 'Edit' : 'Create New'} Activity</h2>
                    <p className="text-sm text-muted-foreground mt-1">Configure {initialData ? 'this' : 'a new'} activity or assignment for this course version.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="title">Title *</Label>
                            <Input id="title" name="title" value={formData.title} onChange={handleChange} placeholder="e.g. Final Project Submission" required />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea id="description" name="description" value={formData.description} onChange={handleChange} placeholder="Describe the activity requirements..." rows={4} />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="activityType">Activity Type</Label>
                            <Select value={formData.activityType} onValueChange={(v) => handleSelectChange('activityType', v)}>
                                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ASSIGNMENT">Assignment</SelectItem>
                                    <SelectItem value="VIBE_MILESTONE">VIBE Milestone</SelectItem>
                                    <SelectItem value="EXTERNAL_IMPORT">External Import</SelectItem>
                                    <SelectItem value="LTI_TOOL">External Tool (LTI)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="submissionMode">Submission Mode</Label>
                            <Select value={formData.submissionMode} onValueChange={(v) => handleSelectChange('submissionMode', v)}>
                                <SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="IN_PLATFORM">In Platform</SelectItem>
                                    <SelectItem value="EXTERNAL_LINK">External Link</SelectItem>
                                    <SelectItem value="CSV_IMPORT">CSV Import</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {formData.activityType === 'LTI_TOOL' && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="ltiToolId">LTI Tool ID *</Label>
                                    <Input id="ltiToolId" name="ltiToolId" value={formData.ltiToolId} onChange={handleChange} placeholder="e.g. tool-1234" required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="ltiToolName">LTI Tool Name</Label>
                                    <Input id="ltiToolName" name="ltiToolName" value={formData.ltiToolName} onChange={handleChange} placeholder="e.g. CodeGrader" />
                                </div>
                                <div className="space-y-2 pt-2">
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      disabled={!formData.ltiToolId}
                                      onClick={async () => {
                                          try {
                                              const res = await fetch(`${import.meta.env.VITE_BASE_URL}/lti/deep-link-launch/${formData.ltiToolId}`, {
                                                  method: 'POST',
                                                  headers: {
                                                      'Content-Type': 'application/json',
                                                      Authorization: `Bearer ${useAuthStore.getState().token}`,
                                                  },
                                                  body: JSON.stringify({
                                                      courseId,
                                                      courseVersionId: versionId,
                                                      activityTitle: formData.title || formData.ltiToolName
                                                  })
                                              });
                                              const data = await res.json();
                                              if (data.success && data.launchUrl && data.token) {
                                                  window.open(`${data.launchUrl}?lti_token=${data.token}`, '_blank', 'width=800,height=600');
                                              } else {
                                                  throw new Error(data.error || 'Failed to initiate deep linking');
                                              }
                                          } catch (err: any) {
                                              toast.error(err.message || 'Failed to launch tool');
                                          }
                                      }}
                                      className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200"
                                    >
                                      Select Link from External Tool
                                    </Button>
                                    <p className="text-xs text-muted-foreground text-center">
                                      Use the tool ID above to securely connect and select an exam directly.
                                    </p>
                                </div>
                            </>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="deadline">Deadline *</Label>
                            <Input id="deadline" name="deadline" type="datetime-local" value={formData.deadline} onChange={handleChange} required />
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Label htmlFor="hpAssignmentMode">HP Assignment Mode</Label>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Info className="h-4 w-4 text-muted-foreground cursor-pointer" />
                                        </TooltipTrigger>
                                        <TooltipContent side="right" className="max-w-[300px]">
                                            <p className="text-sm">
                                                <strong>Automatic:</strong> Health points will be assigned automatically based on the reward configurations once the deadline passes.
                                                <br /><br />
                                                <strong>Manual:</strong> You must assign the health points manually from the Dashboard's "View Submissions" view for each student.
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <Select value={formData.hpAssignmentMode} onValueChange={(v) => handleSelectChange('hpAssignmentMode', v)}>
                                <SelectTrigger><SelectValue placeholder="Select HP mode" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="AUTOMATIC">Automatic</SelectItem>
                                    <SelectItem value="MANUAL">Manual</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="status">Status</Label>
                            <Select value={formData.status} onValueChange={(v) => handleSelectChange('status', v)}>
                                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="DRAFT">Draft</SelectItem>
                                    <SelectItem value="PUBLISHED">Published</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="rewardType">Reward Type</Label>
                            <Select value={formData.rewardType} onValueChange={(v) => handleSelectChange('rewardType', v)}>
                                <SelectTrigger><SelectValue placeholder="Select reward type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ABSOLUTE">Absolute (Fixed HP)</SelectItem>
                                    <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="rewardValue">Reward Value</Label>
                            <Input id="rewardValue" name="rewardValue" type="number" value={formData.rewardValue} onChange={handleChange} min={0} />
                        </div>

                        <div className="space-y-2 flex flex-col justify-center pt-6">
                            <div className="flex items-center space-x-2">
                                <Switch id="mandatory" checked={formData.mandatory} onCheckedChange={(c) => handleSwitchChange('mandatory', c)} />
                                <Label htmlFor="mandatory" className="cursor-pointer">Mandatory Activity</Label>
                            </div>
                        </div>

                        <div className="space-y-2 flex flex-col justify-center pt-6">
                            <div className="flex items-center space-x-2">
                                <Switch id="isProofRequired" checked={formData.isProofRequired} onCheckedChange={(c) => handleSwitchChange('isProofRequired', c)} />
                                <Label htmlFor="isProofRequired" className="cursor-pointer">Proof Required</Label>
                            </div>
                        </div>

                        {formData.mandatory && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="penaltyType">Penalty Type</Label>
                                    <Select value={formData.penaltyType} onValueChange={(v) => handleSelectChange('penaltyType', v)}>
                                        <SelectTrigger><SelectValue placeholder="Select penalty type" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                                            <SelectItem value="ABSOLUTE">Absolute (Fixed HP)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="penaltyValue">Penalty Value</Label>
                                    <Input id="penaltyValue" name="penaltyValue" type="number" value={formData.penaltyValue} onChange={handleChange} min={0} />
                                </div>
                            </>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="gracePeriodDuration">Grace Period (Hours)</Label>
                            <Input id="gracePeriodDuration" name="gracePeriodDuration" type="number" value={formData.gracePeriodDuration} onChange={handleChange} min={0} />
                        </div>

                        {Number(formData.gracePeriodDuration) > 0 && (
                            <div className="space-y-2">
                                <Label htmlFor="graceRewardPercentage">Grace Reward (%)</Label>
                                <Input id="graceRewardPercentage" name="graceRewardPercentage" type="number" value={formData.graceRewardPercentage} onChange={handleChange} min={0} max={100} />
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t">
                        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading} className="bg-primary text-primary-foreground hover:bg-primary/90">
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {initialData ? 'Save Changes' : 'Create Activity'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
