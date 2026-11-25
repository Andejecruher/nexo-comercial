// Local-only, one-shot provisioning of the Pub/Sub emulator resources the app
// relies on. Idempotent: safe to run on every `docker compose up`. It is never
// built or shipped to production (production provisions these in GCP).
//
// Why this exists: the API/worker create the `realtime-events` topic on demand,
// but nothing creates the *push subscription* that delivers `/pubsub/realtime`
// back to the API. Without it, durable realtime events are published into the
// emulator and never reach any socket.
import { PubSub } from '@google-cloud/pubsub';

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'nexo-comercial-dev';
const realtimeTopic = process.env.REALTIME_TOPIC || 'realtime-events';
const aiStreamTopic = process.env.AI_STREAM_TOPIC || 'ai-stream';
const subscriptionName = process.env.REALTIME_SUBSCRIPTION || 'realtime-events-push';
const pushEndpoint = process.env.PUSH_ENDPOINT || 'http://api:8000/pubsub/realtime';

const pubsub = new PubSub({ projectId });

async function ensureTopic(name) {
  const topic = pubsub.topic(name);
  const [exists] = await topic.exists();
  if (exists) {
    console.log(`[pubsub-init] topic ya existe: ${name}`);
    return;
  }
  await topic.create();
  console.log(`[pubsub-init] topic creado: ${name}`);
}

async function ensurePushSubscription() {
  const subscription = pubsub.subscription(subscriptionName);
  const [exists] = await subscription.exists();
  if (exists) {
    console.log(`[pubsub-init] subscription ya existe: ${subscriptionName}`);
    return;
  }

  const base = { pushConfig: { pushEndpoint }, ackDeadlineSeconds: 30 };
  try {
    await pubsub.topic(realtimeTopic).createSubscription(subscriptionName, {
      ...base,
      enableMessageOrdering: true,
    });
    console.log(`[pubsub-init] subscription creada (ordering): ${subscriptionName} -> ${pushEndpoint}`);
  } catch (error) {
    // Ordering support varies across emulator versions; parity of delivery does not
    // depend on it, so fall back to a plain push subscription instead of failing the stack.
    console.warn(`[pubsub-init] ordering no soportado, reintentando sin ordering: ${error?.message}`);
    await pubsub.topic(realtimeTopic).createSubscription(subscriptionName, base);
    console.log(`[pubsub-init] subscription creada: ${subscriptionName} -> ${pushEndpoint}`);
  }
}

async function main() {
  console.log(
    `[pubsub-init] emulador=${process.env.PUBSUB_EMULATOR_HOST ?? '(GCP real)'} project=${projectId}`,
  );
  await ensureTopic(realtimeTopic);
  await ensureTopic(aiStreamTopic);
  await ensurePushSubscription();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[pubsub-init] fallo', error);
    process.exit(1);
  });
