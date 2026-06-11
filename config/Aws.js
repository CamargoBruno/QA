import { S3Client } from "@aws-sdk/client-s3";
import dotenv from 'dotenv';

dotenv.config();

class AWS {
    constructor() {
        this.region = process.env.AWS_REGION;
        this.bucket = process.env.S3_BUCKET;
        this.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
        this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    }

    getS3Client() {
        return new S3Client({
            region: this.region,
            credentials: {
                accessKeyId: this.accessKeyId,
                secretAccessKey: this.secretAccessKey,
            }
        });
    }

    getBucket() {
        return this.bucket;
    }

    getRegion() {
        return this.region;
    }
}

export default AWS;


