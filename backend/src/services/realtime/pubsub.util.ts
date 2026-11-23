import { PubSub, Topic } from '@google-cloud/pubsub';

export type PubSubClientLike = Pick<PubSub, 'topic'>;
export function createPubSubClient(config: { projectId?: string } = {}): PubSub {
  return new PubSub(config.projectId ? { projectId: config.projectId } : {});
}

// Cache per client, never across different projects/emulators.
const publishers = new WeakMap<PubSubClientLike, Map<string, Topic>>();
const topicChecks = new WeakMap<PubSubClientLike, Map<string, Promise<void>>>();
function publisher(client: PubSubClientLike, topicName: string, ordered = true): Topic {
  let topics = publishers.get(client);
  if (!topics) {
    topics = new Map();
    publishers.set(client, topics);
  }
  const key = topicName + ':' + String(ordered);
  let topic = topics.get(key);
  if (!topic) {
    topic = client.topic(topicName, {
      messageOrdering: ordered,
      batching: { maxMilliseconds: 5 },
      gaxOpts: { timeout: 1000, retry: null },
    });
    topics.set(key, topic);
  }
  return topic;
}

/** Used for local/emulator setup; production topics are provisioned at deploy. */
export function ensureTopicOnce(client: PubSubClientLike, topicName: string): Promise<void> {
  let checks = topicChecks.get(client);
  if (!checks) {
    checks = new Map();
    topicChecks.set(client, checks);
  }
  const existing = checks.get(topicName);
  if (existing) return existing;
  const promise = publisher(client, topicName)
    .create()
    .then(() => undefined)
    .catch((error: unknown) => {
      const code = (error as { code?: number })?.code;
      if (
        code === 6 ||
        code === 409 ||
        (error instanceof Error && error.message.includes('ALREADY_EXISTS'))
      )
        return;
      checks!.delete(topicName);
      throw error;
    });
  checks.set(topicName, promise);
  return promise;
}

/** Ordering is configured on the publisher AND subscription, not the topic. */
export async function publishJsonMessage(
  client: PubSubClientLike,
  options: {
    topicName: string;
    payload: Record<string, unknown>;
    orderingKey?: string;
    ordered?: boolean;
  },
): Promise<void> {
  const topic = publisher(client, options.topicName, options.ordered ?? true);
  try {
    await topic.publishMessage({
      data: Buffer.from(JSON.stringify(options.payload)),
      ...((options.ordered ?? true) && options.orderingKey
        ? { orderingKey: options.orderingKey }
        : {}),
    });
  } catch (error) {
    // A failed ordered key must be resumed before its durable retry can publish.
    if (options.orderingKey) topic.resumePublishing?.(options.orderingKey);
    throw error;
  }
}
