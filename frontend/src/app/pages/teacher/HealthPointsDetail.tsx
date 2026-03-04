
import { useSearch } from '@tanstack/react-router';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowLeft, Activity } from 'lucide-react';
import { useStudentHealthPoints, useAddHPEvent } from '@/hooks/useHealthPoints';
import { useState } from 'react';
import { useCourseStore } from '@/store/course-store';

export function HealthPointsDetail() {
    const search = useSearch({ strict: false }) as any;
    const studentId = search.studentId || '';
    const { currentCourse } = useCourseStore();
    const courseId = currentCourse?.courseId || '';

    const { data, isLoading, refetch } = useStudentHealthPoints(courseId, studentId);
    const { mutate, isPending } = useAddHPEvent();

    const [formType, setFormType] = useState<'BONUS' | 'PENALTY' | 'MANUAL'>('BONUS');
    const [percentage, setPercentage] = useState('');
    const [reason, setReason] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!percentage || !reason) return;

        await mutate({
            courseId,
            studentId,
            type: formType,
            percentageChange: Number(percentage),
            reason
        });

        setPercentage('');
        setReason('');
        refetch(); // Refresh data
    };

    if (isLoading || !data) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
            </div>
        );
    }

    const { healthPoints, events } = data;
    const user = healthPoints?.user || { firstName: 'Student', lastName: '' };

    return (
        <div className="container mx-auto py-8 space-y-8">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold">{user.firstName} {user.lastName}</h1>
                    <p className="text-muted-foreground">Brownie Points Details</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Status Card */}
                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5 text-primary" />
                            Current Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex flex-col items-center justify-center py-6">
                            <div className="relative flex items-center justify-center w-32 h-32 rounded-full border-4 border-primary/20 bg-primary/5">
                                <span className="text-4xl font-bold text-primary">{Math.round(healthPoints.currentHP)}</span>
                            </div>
                            <div className="mt-4">
                                <StatusBadge status={healthPoints.status} />
                            </div>
                        </div>

                        <div className="text-sm text-muted-foreground text-center">
                            Last updated: {new Date(healthPoints.lastUpdated).toLocaleDateString()}
                        </div>
                    </CardContent>
                </Card>

                {/* Manual Adjustment Form */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Manual Adjustment</CardTitle>
                        <CardDescription>Grant bonus points or apply penalties manually.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Adjustment Type</Label>
                                    <Select
                                        value={formType}
                                        onValueChange={(v: 'BONUS' | 'PENALTY' | 'MANUAL') => setFormType(v)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="BONUS">Bonus (Add BP)</SelectItem>
                                            <SelectItem value="PENALTY">Penalty (Deduct BP)</SelectItem>
                                            <SelectItem value="MANUAL">Manual Correction</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Percentage (%)</Label>
                                    <Input
                                        type="number"
                                        placeholder="e.g. 5"
                                        value={percentage}
                                        onChange={(e) => setPercentage(e.target.value)}
                                        required
                                        min={formType === 'MANUAL' ? undefined : "0"}
                                        max={formType === 'MANUAL' ? undefined : "100"}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Reason</Label>
                                <Textarea
                                    placeholder="Why is this adjustment being made?"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex justify-end">
                                <Button type="submit" disabled={isPending}>
                                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Apply Adjustment
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>

            {/* History Table */}
            <Card>
                <CardHeader>
                    <CardTitle>History Log</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Change</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead>Created By</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {events && events.map((event: any) => (
                                <TableRow key={event._id}>
                                    <TableCell>{new Date(event.createdAt).toLocaleDateString()} {new Date(event.createdAt).toLocaleTimeString()}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{event.type}</Badge>
                                    </TableCell>
                                    <TableCell className={event.percentageChange >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                        {event.percentageChange > 0 ? '+' : ''}{event.percentageChange}
                                    </TableCell>
                                    <TableCell>{event.reason}</TableCell>
                                    <TableCell>{event.createdByName || event.createdBy || 'System'}</TableCell>
                                </TableRow>
                            ))}
                            {(!events || events.length === 0) && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        No history events found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    if (status === 'healthy') return <Badge className="bg-green-500 hover:bg-green-600">Healthy</Badge>;
    if (status === 'declining') return <Badge className="bg-yellow-500 hover:bg-yellow-600">Declining</Badge>;
    if (status === 'atRisk') return <Badge className="bg-red-500 hover:bg-red-600">At Risk</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
}
