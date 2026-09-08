-- 把 (source, sourceId) 普通索引升级为唯一索引,支撑 createMany skipDuplicates 去重
DROP INDEX "Song_source_sourceId_idx";

CREATE UNIQUE INDEX "Song_source_sourceId_key" ON "Song"("source", "sourceId");
