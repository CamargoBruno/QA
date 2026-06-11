import fs from "fs";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import AWS from "../config/Aws.js";

const aws = new AWS();
const bucket = aws.getBucket();

export async function uploadScreenshot(filePath) {
    const fileContent = fs.readFileSync(filePath);
    const fileName = `erro/${Date.now()}.png`;

    await aws.getS3Client().send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: fileName,
            Body: fileContent,
            ContentType: "image/png"
        })
    );

    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: fileName
    });

    const signedUrl = await getSignedUrl(aws.getS3Client(), command, { expiresIn: 3600 });

    return signedUrl;
}

