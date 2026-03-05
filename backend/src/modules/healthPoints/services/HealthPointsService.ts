
import { injectable, inject } from 'inversify';
import { HealthPointsRepository } from '#shared/database/providers/mongo/repositories/HealthPointsRepository.js';
import { HPStatus, HPEventType, IHealthPoints } from '#shared/interfaces/models.js';
import { ClientSession, ObjectId } from 'mongodb';
import { NotFoundError } from 'routing-controllers';

@injectable()
export class HealthPointsService {
    constructor(
        @inject(HealthPointsRepository) private hpRepo: HealthPointsRepository
    ) { }

    /**
     * Calculates new HP based on percentage change.
     * Rules: 
     * newHP = currentHP + (currentHP * percentage / 100)
     */
    private calculateNewHP(currentHP: number, pointsChange: number): number {
        return Math.max(0, currentHP + pointsChange); // HP cannot be negative
    }

    /**
     * Determines HP status based on absolute value and relative change.
     * Rules:
     * 1. If HP < 100 => 'atRisk'
     * 2. Else if newHP < oldHP => 'declining'
     * 3. Else => 'healthy'
     */
    private determineStatus(newHP: number, oldHP: number): HPStatus {
        if (newHP < 100) return 'atRisk';
        if (newHP < oldHP) return 'declining';
        return 'healthy';
    }

    async getHealthPoints(userId: string, courseId: string, session?: ClientSession) {
        return this.ensureInitialized(userId, courseId, session);
    }

    async getAllHealthPoints(courseId: string, session?: ClientSession) {
        return this.hpRepo.getCourseHP(courseId, session);
    }

    private async ensureInitialized(
        userId: string | ObjectId,
        courseId: string | ObjectId,
        session?: ClientSession
    ) {
        let record = await this.hpRepo.getHP(userId, courseId, session);
        if (!record) {
            await this.hpRepo.initializeHP(userId, courseId, session);
            await this.hpRepo.addEvent(
                userId,
                courseId,
                'INITIALIZED',
                0,
                'System Initialization (Lazy)',
                userId,
                session
            );
            record = await this.hpRepo.getHP(userId, courseId, session);
        }
        return record;
    }

    async addEvent(
        userId: string,
        courseId: string,
        type: HPEventType,
        pointsChange: number,
        reason: string,
        createdBy: string,
        session?: ClientSession
    ): Promise<any> {
        const currentRecord = await this.ensureInitialized(userId, courseId, session);

        // If HP record still not found after initialization (race condition/DB timing), use default
        const previousHP = currentRecord?.currentHP ?? 1000;
        let signedChange = pointsChange;
        if (type === 'BONUS') {
            signedChange = Math.abs(pointsChange);
        } else if (type === 'PENALTY') {
            signedChange = -Math.abs(pointsChange);
        }
        // For MANUAL, use the pointsChange as provided (can be positive or negative)
        const newHP = this.calculateNewHP(previousHP, signedChange);
        const newStatus = this.determineStatus(newHP, previousHP);

        // Record Event
        await this.hpRepo.addEvent(
            userId,
            courseId,
            type,
            signedChange,
            reason,
            createdBy,
            session
        );

        // Update HP
        await this.hpRepo.updateHP(
            userId,
            courseId,
            newHP,
            newStatus,
            session
        );

        return {
            ...(currentRecord ?? {}),
            previousHP,
            currentHP: newHP,
            status: newStatus,
            lastUpdated: new Date()
        };
    }

    async getEvents(userId: string, courseId: string) {
        return this.hpRepo.getEvents(userId, courseId);
    }
}
