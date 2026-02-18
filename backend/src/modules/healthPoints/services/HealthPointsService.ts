
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
    private calculateNewHP(currentHP: number, percentageChange: number): number {
        const delta = (currentHP * percentageChange) / 100;
        return Math.max(0, currentHP + delta); // HP cannot be negative
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
        percentageChange: number,
        reason: string,
        createdBy: string,
        session?: ClientSession
    ): Promise<any> {
        const currentRecord = await this.ensureInitialized(userId, courseId, session);

        if (!currentRecord) {
            // Should not happen after ensureInitialized
            throw new NotFoundError('Failed to initialize Health Points record');
        }

        const previousHP = currentRecord.currentHP;
        let signedPercentage = percentageChange;
        if (type === 'BONUS') {
            signedPercentage = Math.abs(percentageChange);
        } else if (type === 'PENALTY') {
            signedPercentage = -Math.abs(percentageChange);
        }
        // For MANUAL, use the percentageChange as provided (can be positive or negative)
        const newHP = this.calculateNewHP(previousHP, signedPercentage);
        const newStatus = this.determineStatus(newHP, previousHP);

        // Record Event
        await this.hpRepo.addEvent(
            userId,
            courseId,
            type,
            signedPercentage,
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
            ...currentRecord,
            currentHP: newHP,
            status: newStatus,
            lastUpdated: new Date()
        };
    }

    async getEvents(userId: string, courseId: string) {
        return this.hpRepo.getEvents(userId, courseId);
    }
}
