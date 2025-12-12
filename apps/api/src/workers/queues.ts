import { Queue, QueueScheduler, Worker, type JobsOptions, type WorkerOptions } from "bullmq";
import IORedis from "ioredis";

import { env } from "../env";
import type { DeletionJob, IngestionJob, QueueName } from "./types";

const connection = new IORedis(env.REDIS_URL);
const baseOptions = { connection, prefix: env.QUEUE_PREFIX } as const;

export const ingestionQueue = new Queue<IngestionJob>("ingestion", {
  ...baseOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 100,
    removeOnFail: false,
  } satisfies JobsOptions,
});

export const ingestionDlq = new Queue<IngestionJob>("ingestion:dlq", baseOptions);
export const deletionQueue = new Queue<DeletionJob>("deletion", {
  ...baseOptions,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 2_000 },
    removeOnComplete: 100,
    removeOnFail: false,
  } satisfies JobsOptions,
});
export const deletionDlq = new Queue<DeletionJob>("deletion:dlq", baseOptions);

export const schedulers = [new QueueScheduler("ingestion", baseOptions), new QueueScheduler("deletion", baseOptions)];

export const registerFailureHandler = <T extends IngestionJob | DeletionJob>(
  worker: Worker<T>,
  dlq: Queue<T>,
) => {
  worker.on("failed", async (job, err) => {
    await dlq.add(job.name as QueueName, job.data, { attempts: 0, removeOnComplete: 500 });
    // eslint-disable-next-line no-console
    console.error(`[queue:${job.queueName}] job ${job.id} failed`, err);
  });
};

export const workerOptions = (overrides: WorkerOptions = {}): WorkerOptions => ({
  ...overrides,
  connection,
  prefix: env.QUEUE_PREFIX,
});
