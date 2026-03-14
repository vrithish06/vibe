import { injectable, inject } from 'inversify';
import { Collection, ObjectId, ClientSession } from 'mongodb';
import { MongoDatabase } from '../MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { InternalServerError } from 'routing-controllers';
import { IActivity, ActivityStatus } from '#shared/interfaces/models.js';

@injectable()
export class ActivityRepository {
    private activitiesCollection!: Collection<IActivity>;

    constructor(
        @inject(GLOBAL_TYPES.Database) private db: MongoDatabase
    ) { }

    private async init() {
        if (this.activitiesCollection) return;

        this.activitiesCollection = await this.db.getCollection<IActivity>('activities');

        // Create indexes for efficient querying
        await this.activitiesCollection.createIndex({ courseVersionId: 1, status: 1 });
        await this.activitiesCollection.createIndex({ courseId: 1 });
        await this.activitiesCollection.createIndex({ cohortId: 1 });
    }

    /**
     * Converts ObjectId fields to strings for JSON serialization.
     * This ensures proper serialization when sending documents over HTTP.
     */
    private convertActivityToJSON(activity: IActivity): IActivity {
        return {
            ...activity,
            _id: typeof activity._id === 'string' ? activity._id : (activity._id as any)?.toString?.() || activity._id,
            courseId: typeof activity.courseId === 'string' ? activity.courseId : (activity.courseId as any)?.toString?.() || activity.courseId,
            courseVersionId: typeof activity.courseVersionId === 'string' ? activity.courseVersionId : (activity.courseVersionId as any)?.toString?.() || activity.courseVersionId,
            cohortId: !activity.cohortId ? activity.cohortId : typeof activity.cohortId === 'string' ? activity.cohortId : (activity.cohortId as any)?.toString?.() || activity.cohortId,
            createdBy: typeof activity.createdBy === 'string' ? activity.createdBy : (activity.createdBy as any)?.toString?.() || activity.createdBy,
        } as IActivity;
    }

    async create(activityData: Partial<IActivity>, session?: ClientSession): Promise<IActivity> {
        await this.init();

        const newActivity: IActivity = {
            ...activityData,
            courseId: new ObjectId(activityData.courseId!),
            courseVersionId: new ObjectId(activityData.courseVersionId!),
            cohortId: activityData.cohortId ? new ObjectId(activityData.cohortId) : undefined,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: new ObjectId(activityData.createdBy!),
            isDeleted: false,
        } as IActivity;

        try {
            const result = await this.activitiesCollection.insertOne(newActivity, { session });
            const created = { ...newActivity, _id: result.insertedId };
            return this.convertActivityToJSON(created);
        } catch (error: any) {
            throw new InternalServerError(`Failed to create Activity: ${error.message}`);
        }
    }

    async findById(id: string | ObjectId, session?: ClientSession): Promise<IActivity | null> {
        await this.init();
        const activity = await this.activitiesCollection.findOne({ _id: new ObjectId(id), isDeleted: { $ne: true } }, { session });
        return activity ? this.convertActivityToJSON(activity) : null;
    }

    async update(id: string | ObjectId, updateData: Partial<IActivity>, session?: ClientSession): Promise<IActivity | null> {
        await this.init();
        
        const rawUpdate: any = { ...updateData };
        
        // Ensure ObjectId fields are converted if present
        if (rawUpdate.courseId) rawUpdate.courseId = new ObjectId(rawUpdate.courseId);
        if (rawUpdate.courseVersionId) rawUpdate.courseVersionId = new ObjectId(rawUpdate.courseVersionId);
        if (rawUpdate.cohortId) rawUpdate.cohortId = new ObjectId(rawUpdate.cohortId);
        if (rawUpdate.createdBy) rawUpdate.createdBy = new ObjectId(rawUpdate.createdBy);

        const updateDoc = {
            $set: {
                ...rawUpdate,
                updatedAt: new Date()
            }
        };

        const result = await this.activitiesCollection.findOneAndUpdate(
            { _id: new ObjectId(id), isDeleted: { $ne: true } },
            updateDoc,
            { returnDocument: 'after', session }
        );

        return result ? this.convertActivityToJSON(result) : null;
    }

    async findByCourseVersion(
        courseVersionId: string | ObjectId,
        filter: { status?: ActivityStatus, cohortId?: string | ObjectId } = {},
        session?: ClientSession
    ): Promise<IActivity[]> {
        await this.init();

        const query: any = {
            $or: [
                { courseVersionId: new ObjectId(courseVersionId) },
                { courseVersionId: courseVersionId.toString() }
            ],
            isDeleted: { $ne: true }
        };

        if (filter.status) {
            query.status = filter.status;
        }

        if (filter.cohortId) {
            query.cohortId = new ObjectId(filter.cohortId);
        }

        const activities = await this.activitiesCollection.find(query, { session }).sort({ createdAt: -1 }).toArray();
        return activities.map(activity => this.convertActivityToJSON(activity));
    }

    async delete(id: string | ObjectId, session?: ClientSession): Promise<boolean> {
        await this.init();
        const result = await this.activitiesCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { isDeleted: true, updatedAt: new Date() } },
            { session }
        );
        return result.modifiedCount > 0;
    }

    async addSubmittedUser(id: string | ObjectId, userId: string | ObjectId, proofUrl?: string, session?: ClientSession): Promise<boolean> {
        await this.init();
        
        const submissionRecord = {
            userId: new ObjectId(userId),
            submittedAt: new Date(),
            ...(proofUrl && { proofUrl })
        };

        const result = await this.activitiesCollection.updateOne(
            { _id: new ObjectId(id) },
            {
                $addToSet: { 
                    submittedUsers: new ObjectId(userId),
                    submissions: submissionRecord as any
                },
                $set: { updatedAt: new Date() }
            },
            { session }
        );
        return result.modifiedCount > 0;
    }

    async getSubmissionsWithUserDetails(id: string | ObjectId, session?: ClientSession): Promise<any[]> {
        await this.init();
        
        const activityId = new ObjectId(id);
        
        const pipeline = [
            { $match: { _id: activityId, isDeleted: { $ne: true } } },
            { $unwind: "$submissions" },
            {
                $lookup: {
                    from: "users",
                    localField: "submissions.userId",
                    foreignField: "_id",
                    as: "user"
                }
            },
            { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    userId: { $toString: "$submissions.userId" },
                    proofUrl: "$submissions.proofUrl",
                    submittedAt: "$submissions.submittedAt",
                    hpAwarded: "$submissions.hpAwarded",
                    firstName: "$user.firstName",
                    lastName: "$user.lastName",
                    email: "$user.email"
                }
            }
        ];

        return this.activitiesCollection.aggregate(pipeline, { session }).toArray();
    }

    async updateSubmissionGrade(id: string | ObjectId, userId: string | ObjectId, hpAwarded: number, session?: ClientSession): Promise<boolean> {
        await this.init();
        const result = await this.activitiesCollection.updateOne(
            { _id: new ObjectId(id), "submissions.userId": new ObjectId(userId) },
            { 
               $set: { "submissions.$.hpAwarded": hpAwarded, updatedAt: new Date() }
            },
            { session }
        );
        return result.modifiedCount > 0;
    }
    async findForAutomaticGrading(): Promise<IActivity[]> {
        await this.init();
        return this.activitiesCollection.find({
            hpAssignmentMode: 'AUTOMATIC',
            isAutomaticallyGraded: { $ne: true },
            status: 'PUBLISHED',
            deadline: { $lte: new Date() },
            isDeleted: { $ne: true }
        }).toArray();
    }

    async markAsAutomaticallyGraded(id: string | ObjectId): Promise<boolean> {
        await this.init();
        const result = await this.activitiesCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { isAutomaticallyGraded: true, updatedAt: new Date() } }
        );
        return result.modifiedCount > 0;
    }
}
