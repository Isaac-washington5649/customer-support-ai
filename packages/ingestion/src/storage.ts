import {
  CreateBucketCommand,
  PutBucketAclCommand,
  S3Client,
  type CreateBucketCommandInput,
  type PutBucketAclCommandInput,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

export type WorkspaceBucketAcl = "private" | "public-read";

export interface S3WorkspaceConfig {
  bucketPrefix: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  forcePathStyle?: boolean;
}

export const workspaceBucketName = (prefix: string, workspaceSlug: string) =>
  `${prefix}-${workspaceSlug}`;

export const createS3Client = ({
  accessKeyId,
  secretAccessKey,
  endpoint,
  region,
  forcePathStyle = true,
}: Pick<S3WorkspaceConfig, "accessKeyId" | "secretAccessKey" | "endpoint" | "region" | "forcePathStyle">) => {
  const config: S3ClientConfig = {
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    endpoint,
    region,
    forcePathStyle,
  };

  return new S3Client(config);
};

export async function ensureWorkspaceBucket(
  client: S3Client,
  options: { bucket: string; region: string; acl: WorkspaceBucketAcl },
) {
  const createInput: CreateBucketCommandInput = {
    Bucket: options.bucket,
    CreateBucketConfiguration: { LocationConstraint: options.region },
  };

  try {
    await client.send(new CreateBucketCommand(createInput));
  } catch (error) {
    const message = (error as Error).message || "";
    if (!message.includes("BucketAlreadyOwnedByYou") && !message.includes("BucketAlreadyExists")) {
      throw error;
    }
  }

  const aclInput: PutBucketAclCommandInput = {
    Bucket: options.bucket,
    ACL: options.acl,
  };

  await client.send(new PutBucketAclCommand(aclInput));
}
