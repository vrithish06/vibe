
import { injectable, inject } from 'inversify';
import { Collection, ObjectId, ClientSession } from 'mongodb';
import { MongoDatabase } from '../MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { InternalServerError } from 'routing-controllers';
import {
    IHealthPoints,
    IHPEvent,
    HPStatus,
    HPEventType
} from '#shared/interfaces/models.js';

@injectable()
export class HealthPointsRepository {
    private healthPointsCollection!: Collection<IHealthPoints>;
    private hpEventsCollection!: Collection<IHPEvent>;

    constructor(
        @inject(GLOBAL_TYPES.Database) private db: MongoDatabase
    ) { }

    private async init() {
        if (this.healthPointsCollection && this.hpEventsCollection) return;

        this.healthPointsCollection = await this.db.getCollection<IHealthPoints>('health_points');
        this.hpEventsCollection = await this.db.getCollection<IHPEvent>('hp_events');

        // Create unique index for health_points
        await this.healthPointsCollection.createIndex(
            { userId: 1, courseId: 1 },
            { unique: true }
        );

        // Create index for hp_events for efficient querying
        await this.hpEventsCollection.createIndex({ userId: 1, courseId: 1, createdAt: -1 });
    }

    async initializeHP(
        userId: string | ObjectId,
        courseId: string | ObjectId,
        session?: ClientSession
    ): Promise<string> {
        await this.init();
        const userObjectId = new ObjectId(userId);
        const courseObjectId = new ObjectId(courseId);

        const initialHP: IHealthPoints = {
            userId: userObjectId,
            courseId: courseObjectId,
            currentHP: 100,
            status: 'healthy',
            lastUpdated: new Date()
        };

        try {
            const result = await this.healthPointsCollection.insertOne(initialHP, { session });
            return result.insertedId.toString();
        } catch (error: any) {
            if (error.code === 11000) {
                // User already has HP record for this course, ignore duplicate error
                const existing = await this.healthPointsCollection.findOne({
                    userId: userObjectId,
                    courseId: courseObjectId
                }, { session });
                return existing?._id?.toString() || '';
            }
            throw new InternalServerError(`Failed to initialize HP: ${error.message}`);
        }
    }

    async getHP(
        userId: string | ObjectId,
        courseId: string | ObjectId,
        session?: ClientSession
    ): Promise<any | null> {
        await this.init();
        const results = await this.healthPointsCollection.aggregate([
            {
                $match: {
                    userId: new ObjectId(userId),
                    courseId: new ObjectId(courseId)
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user',
                    pipeline: [
                        { $project: { firstName: 1, lastName: 1, email: 1 } }
                    ]
                }
            },
            {
                $unwind: { path: '$user', preserveNullAndEmptyArrays: true }
            }
        ], { session }).toArray();

        return results.length ? results[0] : null;
    }

    async updateHP(
        userId: string | ObjectId,
        courseId: string | ObjectId,
        currentHP: number,
        status: HPStatus,
        session?: ClientSession
    ): Promise<void> {
        await this.init();
        await this.healthPointsCollection.updateOne(
            {
                userId: new ObjectId(userId),
                courseId: new ObjectId(courseId)
            },
            {
                $set: {
                    currentHP,
                    status,
                    lastUpdated: new Date()
                }
            },
            { session }
        );
    }

    async addEvent(
        userId: string | ObjectId,
        courseId: string | ObjectId,
        type: HPEventType,
        percentageChange: number,
        reason: string,
        createdBy: string | ObjectId,
        session?: ClientSession
    ): Promise<string> {
        await this.init();
        const event: IHPEvent = {
            userId: new ObjectId(userId),
            courseId: new ObjectId(courseId),
            type,
            percentageChange,
            reason,
            createdAt: new Date(),
            createdBy: new ObjectId(createdBy)
        };

        const result = await this.hpEventsCollection.insertOne(event, { session });
        return result.insertedId.toString();
    }

    async getEvents(
        userId: string | ObjectId,
        courseId: string | ObjectId,
        session?: ClientSession
    ): Promise<any[]> {
        await this.init();
        return await this.hpEventsCollection.aggregate([
            {
                $match: {
                    userId: new ObjectId(userId),
                    courseId: new ObjectId(courseId)
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'creator',
                    pipeline: [
                        { $project: { firstName: 1, lastName: 1 } }
                    ]
                }
            },
            {
                $unwind: { path: '$creator', preserveNullAndEmptyArrays: true }
            },
            {
                $addFields: {
                    createdByName: {
                        $trim: {
                            input: {
                                $concat: [
                                    { $ifNull: ['$creator.firstName', ''] },
                                    ' ',
                                    { $ifNull: ['$creator.lastName', ''] }
                                ]
                            }
                        }
                    }
                }
            },
            { $sort: { createdAt: -1 } },
            {
                $project: {
                    _id: { $toString: '$_id' },
                    type: 1,
                    percentageChange: 1,
                    reason: 1,
                    createdAt: 1,
                    createdByName: 1,
                    createdBy: { $toString: '$createdBy' }
                }
            }
        ], { session }).toArray();
    }

    async getCourseHP(
        courseId: string | ObjectId,
        session?: ClientSession
    ): Promise<any[]> {
        await this.init();
        const enrollments = await this.db.getCollection('enrollment');
        const courseObjectId = new ObjectId(courseId);

        return await enrollments.aggregate([
            {
                $match: {
                    courseId: courseObjectId,
                    role: 'STUDENT' // Filter only students
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user',
                    pipeline: [
                        { $project: { firstName: 1, lastName: 1, email: 1, _id: 1 } }
                    ]
                }
            },
            {
                $unwind: { path: '$user', preserveNullAndEmptyArrays: true }
            },
            {
                $lookup: {
                    from: 'health_points',
                    let: { uid: '$userId', cid: '$courseId' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$userId', '$$uid'] },
                                        { $eq: ['$courseId', '$$cid'] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'hp'
                }
            },
            {
                $unwind: { path: '$hp', preserveNullAndEmptyArrays: true }
            },
            {
                $project: {
                    _id: 1,
                    userId: { $toString: '$userId' },
                    courseId: { $toString: '$courseId' },
                    currentHP: { $ifNull: ['$hp.currentHP', 100] },
                    status: { $ifNull: ['$hp.status', 'healthy'] },
                    lastUpdated: { $ifNull: ['$hp.lastUpdated', null] },
                    user: 1
                }
            }
        ], { session }).toArray();
    }
}
