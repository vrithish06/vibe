import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuthStore } from '@/store/auth-store';

interface AddActivityProps {
    courseId: string;
    versionId: string;
    onSuccess: () => void;
    onCancel: () => void;
}

export function AddActivity({ courseId, versionId, onSuccess, onCancel }: AddActivityProps) {
    const { token } = useAuthStore();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        activityType: 'ASSIGNMENT_PROOF',
        deadline: '',
        rewardType: 'ABSOLUTE',
        rewardValue: 10,
        mandatory: false,
        penaltyType: 'PERCENTAGE',
        penaltyValue: 0,
        submissionMode: 'IN_PLATFORM',
        status: 'PUBLISHED',
        gracePeriodDuration: 0,
        graceRewardPercentage: 100
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'number' ? Number(value) : value
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

        setIsLoading(true);
        try {
            const response = await fetch(`${import.meta.env.VITE_BASE_URL}/activities`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    courseId,
                    courseVersionId: versionId,
                    ...formData,
                    deadline: new Date(formData.deadline).toISOString(),
                    // Only send penalty fields when mandatory is true
                    penaltyType: formData.mandatory ? formData.penaltyType : undefined,
                    penaltyValue: formData.mandatory ? formData.penaltyValue : undefined,
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to create activity");
            }

            toast.success("Activity created successfully");
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
                    <h2 className="text-xl font-bold text-slate-900 dark:text-gray-100">Create New Activity</h2>
                    <p className="text-sm text-muted-foreground mt-1">Configure a new activity or assignment for this course version.</p>
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
                                    <SelectItem value="ASSIGNMENT_PROOF">Assignment Proof</SelectItem>
                                    <SelectItem value="VIBE_MILESTONE">VIBE Milestone</SelectItem>
                                    <SelectItem value="EXTERNAL_IMPORT">External Import</SelectItem>
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

                        <div className="space-y-2">
                            <Label htmlFor="deadline">Deadline *</Label>
                            <Input id="deadline" name="deadline" type="datetime-local" value={formData.deadline} onChange={handleChange} required />
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

                        {formData.gracePeriodDuration > 0 && (
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
                            Create Activity
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
