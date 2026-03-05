import { useStudentSelfHealthPoints } from "@/hooks/useHealthPoints";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, ShieldCheck, TrendingDown, Target, Zap, ServerCrash } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import React from "react";

function StatusBadge({ status }: { status: string }) {
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'healthy': return 'bg-green-500 hover:bg-green-600';
            case 'declining': return 'bg-yellow-500 hover:bg-yellow-600';
            case 'atRisk': return 'bg-red-500 hover:bg-red-600';
            default: return 'bg-gray-500 hover:bg-gray-600';
        }
    };

    return (
        <Badge className={`${getStatusColor(status)} text-white capitalize`}>
            {status?.replace(/([A-Z])/g, ' $1').trim()}
        </Badge>
    );
}

export default function StudentHealthPoints({ courseId }: { courseId: string }) {
    const { data: healthData, isLoading, error } = useStudentSelfHealthPoints(courseId);

    if (isLoading) {
        return (
            <div className="flex-1 w-full bg-background/50 h-full overflow-y-auto overflow-x-hidden p-6">
                <div className="max-w-4xl mx-auto space-y-6">
                    <Skeleton className="h-12 w-64" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Skeleton className="h-40 w-full" />
                        <Skeleton className="h-40 w-full" />
                    </div>
                </div>
            </div>
        );
    }

    if (error || !healthData) {
        return (
            <div className="flex-1 w-full bg-background/50 h-full p-6 flex flex-col items-center justify-center text-center">
                <ServerCrash className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground max-w-sm">Failed to load your brownie points for this course.</p>
            </div>
        );
    }

    const { healthPoints, events, averageHP } = healthData;

    return (
        <div className="flex-1 w-full bg-background/50 h-full overflow-y-auto overflow-x-hidden">
            <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4 text-center md:text-left">
                        <div className="p-4 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 border border-primary/20">
                            <Activity className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-foreground drop-shadow-sm">Brownie Points</h1>
                            <p className="text-muted-foreground mt-1 text-sm">Track your standing and engagement in this course.</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="border-border/50 shadow-md">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5 text-green-500" /> Your Brownie Points Score
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-end gap-2">
                                    <span className="text-5xl font-black text-primary drop-shadow-sm">
                                        {healthPoints ? Math.round(healthPoints.currentHP) : 100}
                                    </span>
                                    <span className="text-sm font-semibold text-muted-foreground mb-1">BP</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <StatusBadge status={healthPoints?.status || 'healthy'} />
                                    <p className="text-xs text-muted-foreground">
                                        Last Updated: {healthPoints?.lastUpdated ? new Date(healthPoints.lastUpdated).toLocaleDateString() : 'N/A'}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/50 shadow-md">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Target className="w-5 h-5 text-blue-500" /> Class Average
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-end gap-2 text-foreground/80">
                                    <span className="text-5xl font-black drop-shadow-sm opacity-90">
                                        {Math.round(averageHP)}
                                    </span>
                                    <span className="text-sm font-semibold text-muted-foreground mb-1">BP</span>
                                </div>
                                <p className="text-sm text-muted-foreground mt-2">
                                    Compare your performance with the overall class average standing.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="border-border/50 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Zap className="w-5 h-5 text-amber-500" />
                            Activity Log
                        </CardTitle>
                        <CardDescription>
                            Recent events that affected your Brownie Points.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="max-h-[400px]">
                            <Table>
                                <TableHeader className="bg-muted/50 sticky top-0">
                                    <TableRow className="border-border/50">
                                        <TableHead>Date</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Change</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead>Created By</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(!events || events.length === 0) ? (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                                No events logged yet.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        events.map((event: any) => (
                                            <TableRow key={event._id} className="border-border/50 group hover:bg-muted/20">
                                                <TableCell className="w-[180px] text-xs font-medium whitespace-nowrap">
                                                    {new Date(event.createdAt).toLocaleDateString()} {new Date(event.createdAt).toLocaleTimeString()}
                                                </TableCell>
                                                <TableCell className="w-[120px]">
                                                    <Badge variant="outline" className="text-[10px] tracking-wider font-semibold uppercase">{event.type}</Badge>
                                                </TableCell>
                                                <TableCell className={`w-[80px] font-bold ${event.pointsChange >= 0 ? 'text-green-500' : 'text-rose-500'}`}>
                                                    {event.pointsChange > 0 ? '+' : ''}{event.pointsChange}
                                                </TableCell>
                                                <TableCell className="text-sm text-foreground/90">
                                                    {event.reason}
                                                </TableCell>
                                                <TableCell className="w-[150px] text-xs font-medium text-muted-foreground whitespace-nowrap">
                                                    {event.createdByName || event.createdBy || 'System'}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div >
    );
}
