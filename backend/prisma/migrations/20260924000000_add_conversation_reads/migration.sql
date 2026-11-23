-- CreateTable
CREATE TABLE "conversation_reads" (
    "user_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "last_read_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversation_reads_pkey" PRIMARY KEY ("user_id","conversation_id")
);

-- CreateIndex
CREATE INDEX "conversation_reads_conversation_id_idx" ON "conversation_reads"("conversation_id");

-- AddForeignKey
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
