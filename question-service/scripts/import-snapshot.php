<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}
require dirname(__DIR__) . '/src/QuestionService.php';

$raw = stream_get_contents(STDIN, 1000000);
$snapshot = json_decode($raw, true, 16);
if (!is_array($snapshot) || !isset($snapshot['votes'], $snapshot['jwks'])
    || !is_array($snapshot['votes']) || !is_array($snapshot['jwks'])
    || count($snapshot['votes']) > 10000 || count($snapshot['jwks']) !== 1) {
    fwrite(STDERR, "Invalid snapshot\n");
    exit(1);
}

foreach ($snapshot['votes'] as $vote) {
    if (!is_array($vote) || qm_positive_int($vote['topic_id'] ?? null, 1000000000) === null
        || qm_positive_int($vote['floor'] ?? null, 1000000) === null
        || !is_string($vote['subject_hash'] ?? null)
        || !preg_match('/^[a-f0-9]{64}$/D', $vote['subject_hash'])
        || !is_int($vote['created_at'] ?? null) || $vote['created_at'] < 1) {
        fwrite(STDERR, "Invalid vote row\n");
        exit(1);
    }
}
$keyRow = $snapshot['jwks'][0];
if (!is_array($keyRow) || ($keyRow['id'] ?? null) !== 1
    || !is_string($keyRow['jwks_json'] ?? null)
    || !is_int($keyRow['updated_at'] ?? null)) {
    fwrite(STDERR, "Invalid JWKS row\n");
    exit(1);
}
qm_jwks($keyRow['jwks_json']);

$db = qm_db();
$db->beginTransaction();
try {
    $db->exec('DELETE FROM question_votes');
    $insert = $db->prepare('INSERT INTO question_votes (topic_id, floor, subject_hash, created_at) VALUES (?, ?, ?, ?)');
    foreach ($snapshot['votes'] as $vote) {
        $insert->execute([$vote['topic_id'], $vote['floor'], $vote['subject_hash'], $vote['created_at']]);
    }
    $insert = $db->prepare('INSERT OR REPLACE INTO question_jwks (id, jwks_json, updated_at) VALUES (1, ?, ?)');
    $insert->execute([$keyRow['jwks_json'], $keyRow['updated_at']]);
    $db->commit();
} catch (Throwable $error) {
    if ($db->inTransaction()) $db->rollBack();
    fwrite(STDERR, 'Snapshot import failed: ' . get_class($error) . ' (' . $error->getCode() . ') '
        . $error->getMessage() . "\n");
    exit(1);
}
echo 'Imported votes: ' . count($snapshot['votes']) . "\n";
