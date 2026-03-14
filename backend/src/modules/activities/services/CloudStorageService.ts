import { injectable, inject } from 'inversify';
import { InternalServerError } from 'routing-controllers';
import { GridFSBucket, ObjectId } from 'mongodb';
import { Readable } from 'stream';
import { MongoDatabase } from '#shared/database/providers/mongo/MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';

/**
 * Handles uploading, retrieving, and downloading proof files
 * using MongoDB GridFS — no external cloud storage needed.
 */
@injectable()
export class CloudStorageService {
  private bucket: GridFSBucket | null = null;

  constructor(
    @inject(GLOBAL_TYPES.Database) private mongoDatabase: MongoDatabase
  ) {}

  /**
   * Lazily initialise and return the GridFS bucket.
   * We use a dedicated "activityProofs" bucket to keep things separate.
   */
  private async getBucket(): Promise<GridFSBucket> {
    if (this.bucket) return this.bucket;

    await this.mongoDatabase.connect();
    const db = this.mongoDatabase.database;
    if (!db) throw new InternalServerError('Database is not connected');

    this.bucket = new GridFSBucket(db, { bucketName: 'activityProofs' });
    return this.bucket;
  }

  /**
   * Upload an activity proof file into MongoDB GridFS.
   * Returns the GridFS file ID as a string, which we store on the submission.
   */
  async uploadActivityProof(
    file: Express.Multer.File,
    userId: string,
    activityId: string,
    timestamp: Date,
  ): Promise<string> {
    const bucket = await this.getBucket();

    // Friendly filename stored inside GridFS metadata
    const ext = file.originalname.split('.').pop() || file.mimetype.split('/')[1] || 'bin';
    const filename = `activity-proofs/${activityId}/${userId}/${timestamp.getTime()}.${ext}`;

    return new Promise((resolve, reject) => {
      // Create a readable stream from the in-memory file buffer
      const readStream = Readable.from(file.buffer);

      const uploadStream = bucket.openUploadStream(filename, {
        metadata: {
          userId,
          activityId,
          originalName: file.originalname,
          mimetype: file.mimetype,
          uploadedAt: timestamp.toISOString(),
        },
      });

      readStream.pipe(uploadStream);

      uploadStream.on('finish', () => {
        console.log(`[CloudStorageService] Proof uploaded to GridFS with id: ${uploadStream.id}`);
        // Return the GridFS file ID as a string
        resolve(uploadStream.id.toString());
      });

      uploadStream.on('error', (err) => {
        reject(new InternalServerError(`Failed to upload proof to GridFS: ${err.message}`));
      });
    });
  }

  /**
   * Download a file from GridFS by its file ID.
   * Returns a readable stream so the controller can pipe it directly to the HTTP response.
   */
  async downloadProof(fileId: string): Promise<{ stream: Readable; metadata: any }> {
    const bucket = await this.getBucket();

    // Look up file metadata first to check it exists and get content type
    const files = await bucket.find({ _id: new ObjectId(fileId) }).toArray();
    if (!files.length) {
      throw new InternalServerError(`Proof file not found: ${fileId}`);
    }

    const fileDoc = files[0];
    const stream = bucket.openDownloadStream(new ObjectId(fileId));

    return {
      stream,
      metadata: {
        filename: fileDoc.filename,
        contentType: (fileDoc.metadata as any)?.mimetype || 'application/octet-stream',
        originalName: (fileDoc.metadata as any)?.originalName || fileDoc.filename,
        length: fileDoc.length,
      },
    };
  }
}
