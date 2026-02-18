import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useCourseHealthPoints } from '@/hooks/useHealthPoints';
import { useCourseStore } from '@/store/course-store';
import { useNavigate } from '@tanstack/react-router';

function StatusBadge({ status }: { status: string }) {
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'healthy':
                return 'bg-green-500 hover:bg-green-600';
            case 'declining':
                return 'bg-yellow-500 hover:bg-yellow-600';
            case 'atRisk':
                return 'bg-red-500 hover:bg-red-600';
            default:
                return 'bg-gray-500 hover:bg-gray-600';
        }
    };

    return (
        <Badge className={`${getStatusColor(status)} text-white capitalize`}>
            {status.replace(/([A-Z])/g, ' $1').trim()}
        </Badge>
    );
}

export function HealthPointsOverview() {
    const { currentCourse } = useCourseStore();
    const navigate = useNavigate();
    const { data: students, isLoading } = useCourseHealthPoints(
        currentCourse?.courseId || ''
    );

    const handleStudentClick = (studentId: string) => {
        navigate({
            to: '/teacher/courses/healthPoints/student',
            search: { studentId },
        });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8 space-y-6">
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => window.history.back()}
                >
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <h1 className="text-3xl font-bold">Health Points Overview</h1>
            </div>

            <div className="border rounded-lg p-4 bg-card">
                <h2 className="text-xl font-semibold mb-4">Student Health Status</h2>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[400px]">Student Name</TableHead>
                            <TableHead>Current HP</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Last Updated</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {students && students.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                    No Health Points records found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            students?.map((record: any) => (
                                <TableRow
                                    key={record.userId}
                                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                                    onClick={() => handleStudentClick(record.userId)}
                                >
                                    <TableCell>
                                        <div className="flex items-center gap-4">
                                            <Avatar className="h-10 w-10 border border-border">
                                                <AvatarImage src="" alt={record.user?.firstName || 'Student'} />
                                                <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground font-bold text-lg">
                                                    {record.user?.firstName?.[0]?.toUpperCase()}
                                                    {record.user?.lastName?.[0]?.toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="font-medium text-foreground">
                                                    {record.user
                                                        ? `${record.user.firstName} ${record.user.lastName}`
                                                        : 'Unknown Student'}
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                    {record.user?.email || 'No email'}
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {Math.round(record.currentHP)}
                                    </TableCell>
                                    <TableCell>
                                        <StatusBadge status={record.status} />
                                    </TableCell>
                                    <TableCell>
                                        {record.lastUpdated
                                            ? new Date(record.lastUpdated).toLocaleDateString()
                                            : 'N/A'}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
