CREATE INDEX IF NOT EXISTS "memory_chunks_embedding_hnsw_idx" ON "memory_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_chunks_embedding_hnsw_idx" ON "source_chunks" USING hnsw ("embedding" vector_cosine_ops);
