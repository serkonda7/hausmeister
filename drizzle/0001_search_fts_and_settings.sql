-- Hand-written migration (drizzle-kit cannot model virtual tables).
--
-- Full-text search over items (DESIGN §5.4). The trigram tokenizer makes
-- substring matches work for German compounds ("schrauber" -> "Akkuschrauber");
-- remove_diacritics needs SQLite >= 3.45. `item_id` links back to items.id
-- (items has a TEXT primary key, so its implicit rowid is not stable across
-- VACUUM). The search module keeps this table in sync from application code,
-- feeding it text normalized like the query (lowercase, ß -> ss).
CREATE VIRTUAL TABLE `items_fts` USING fts5(
	item_id UNINDEXED,
	name,
	description,
	tags,
	attrs,
	tokenize = 'trigram remove_diacritics 1'
);
--> statement-breakpoint
-- The household settings singleton (DESIGN §6: settings.id = 1).
INSERT OR IGNORE INTO `settings` (`id`) VALUES (1);
