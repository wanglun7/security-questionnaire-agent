import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

export async function createPostgresCheckpointer() {
  const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
  await checkpointer.setup();
  return checkpointer;
}
