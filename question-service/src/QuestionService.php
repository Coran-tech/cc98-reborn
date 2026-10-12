<?php
declare(strict_types=1);

final class QuestionApiError extends RuntimeException
{
    public $httpStatus;

    public function __construct(int $status, string $message)
    {
        parent::__construct($message);
        $this->httpStatus = $status;
    }
}

function qm_config(): array
{
    static $config;
    if ($config === null) {
        $path = dirname(__DIR__) . '/config.php';
        if (!is_file($path)) {
            throw new QuestionApiError(503, 'Question service is not configured');
        }
        $config = require $path;
    }
    return $config;
}

function qm_db(): PDO
{
    static $db;
    if ($db === null) {
        $db = new PDO('sqlite:' . qm_config()['database_path']);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $db->exec('PRAGMA busy_timeout = 3000');
    }
    return $db;
}

function qm_now_ms(): int
{
    return (int) floor(microtime(true) * 1000);
}

function qm_allowed_origin(): ?string
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    return is_string($origin) && preg_match('~^chrome-extension://[a-p]{32}$~D', $origin)
        ? $origin : null;
}

function qm_api_headers(): void
{
    header('Cache-Control: no-store');
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Vary: Origin');
    if ($origin = qm_allowed_origin()) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
}

function qm_json(array $body, int $status = 200): void
{
    http_response_code($status);
    qm_api_headers();
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function qm_options(): void
{
    $origin = qm_allowed_origin();
    if ($origin === null) {
        qm_json(['error' => 'Origin not allowed'], 403);
        return;
    }
    http_response_code(204);
    header('Cache-Control: no-store');
    header('Vary: Origin');
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Max-Age: 600');
}

function qm_assert_origin(): void
{
    if (isset($_SERVER['HTTP_ORIGIN']) && qm_allowed_origin() === null) {
        throw new QuestionApiError(403, 'Origin not allowed');
    }
}

function qm_body(): array
{
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($type, 'application/json') !== 0) {
        throw new QuestionApiError(415, 'Expected JSON');
    }
    $input = fopen('php://input', 'rb');
    $raw = stream_get_contents($input, 8193);
    fclose($input);
    if ($raw === false || $raw === '') {
        throw new QuestionApiError(400, 'Empty body');
    }
    if (strlen($raw) > 8192) {
        throw new QuestionApiError(413, 'Request too large');
    }
    $decoded = json_decode($raw, false, 16);
    if (!$decoded instanceof stdClass) {
        throw new QuestionApiError(400, 'Invalid JSON object');
    }
    return (array) $decoded;
}

function qm_only_fields(array $body, array $names): bool
{
    $keys = array_keys($body);
    sort($keys);
    sort($names);
    return $keys === $names;
}

function qm_positive_int($value, int $max): ?int
{
    return is_int($value) && $value > 0 && $value <= $max ? $value : null;
}

function qm_token(int $bytes): string
{
    return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
}

function qm_subject_hash(string $subject): string
{
    $encoded = qm_config()['hmac_secret'] ?? '';
    if (!is_string($encoded) || !preg_match('/^[A-Za-z0-9_-]{43}$/D', $encoded)) {
        throw new QuestionApiError(503, 'Question identity key unavailable');
    }
    $secret = qm_b64url_decode($encoded);
    if (strlen($secret) !== 32) {
        throw new QuestionApiError(503, 'Question identity key unavailable');
    }
    return hash_hmac('sha256', 'cc98-subject:' . $subject, $secret);
}

function qm_rate_limit(string $action, int $limit): void
{
    $window = (int) floor(qm_now_ms() / 60000);
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $key = qm_subject_hash('rate:' . $action . ':' . $ip . ':' . $window);
    $db = qm_db();
    $stmt = $db->prepare('INSERT OR IGNORE INTO question_rate_limits (rate_key, count, expires_at) VALUES (?, 0, ?)');
    $stmt->execute([$key, ($window + 2) * 60000]);
    $stmt = $db->prepare('UPDATE question_rate_limits SET count = count + 1 WHERE rate_key = ?');
    $stmt->execute([$key]);
    $stmt = $db->prepare('SELECT count FROM question_rate_limits WHERE rate_key = ?');
    $stmt->execute([$key]);
    if ((int) $stmt->fetchColumn() > $limit) {
        throw new QuestionApiError(429, 'Too many requests');
    }
}

function qm_require_session(): string
{
    $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer ([A-Za-z0-9_-]{43})$/D', $authorization, $match)) {
        throw new QuestionApiError(401, 'Session expired');
    }
    $stmt = qm_db()->prepare('SELECT subject_hash FROM question_sessions WHERE token_hash = ? AND expires_at > ?');
    $stmt->execute([hash('sha256', $match[1]), qm_now_ms()]);
    $subject = $stmt->fetchColumn();
    if (!is_string($subject)) {
        throw new QuestionApiError(401, 'Session expired');
    }
    return $subject;
}

function qm_b64url_decode(string $value): string
{
    if (!preg_match('/^[A-Za-z0-9_-]+$/D', $value)) {
        throw new QuestionApiError(401, 'OpenID validation failed');
    }
    $decoded = base64_decode(strtr($value, '-_', '+/') . str_repeat('=', (4 - strlen($value) % 4) % 4), true);
    if ($decoded === false || rtrim(strtr(base64_encode($decoded), '+/', '-_'), '=') !== $value) {
        throw new QuestionApiError(401, 'OpenID validation failed');
    }
    return $decoded;
}

function qm_der_length(int $length): string
{
    if ($length < 128) return chr($length);
    $bytes = '';
    while ($length > 0) {
        $bytes = chr($length & 255) . $bytes;
        $length >>= 8;
    }
    return chr(0x80 | strlen($bytes)) . $bytes;
}

function qm_der(int $tag, string $value): string
{
    return chr($tag) . qm_der_length(strlen($value)) . $value;
}

function qm_der_integer(string $value): string
{
    $value = ltrim($value, "\x00");
    if ($value === '') $value = "\x00";
    if (ord($value[0]) & 0x80) $value = "\x00" . $value;
    return qm_der(0x02, $value);
}

function qm_rsa_pem(array $jwk): string
{
    $rsa = qm_der(0x30, qm_der_integer(qm_b64url_decode($jwk['n']))
        . qm_der_integer(qm_b64url_decode($jwk['e'])));
    $algorithm = hex2bin('300d06092a864886f70d0101010500');
    $spki = qm_der(0x30, $algorithm . qm_der(0x03, "\x00" . $rsa));
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

function qm_admin_pem(string $raw): string
{
    if (strlen($raw) > 1000) throw new QuestionApiError(503, 'Trusted key updater is not enrolled');
    $key = json_decode($raw, true, 8);
    if (!is_array($key) || array_diff(array_keys($key), ['kty', 'crv', 'x', 'y', 'ext', 'key_ops', 'alg'])
        || ($key['kty'] ?? null) !== 'EC' || ($key['crv'] ?? null) !== 'P-256'
        || !is_string($key['x'] ?? null) || !preg_match('/^[A-Za-z0-9_-]{43}$/D', $key['x'])
        || !is_string($key['y'] ?? null) || !preg_match('/^[A-Za-z0-9_-]{43}$/D', $key['y'])) {
        throw new QuestionApiError(503, 'Trusted key updater is not enrolled');
    }
    $x = qm_b64url_decode($key['x']);
    $y = qm_b64url_decode($key['y']);
    if (strlen($x) !== 32 || strlen($y) !== 32) {
        throw new QuestionApiError(503, 'Trusted key updater is not enrolled');
    }
    $algorithm = hex2bin('301306072a8648ce3d020106082a8648ce3d030107');
    $spki = qm_der(0x30, $algorithm . qm_der(0x03, "\x00\x04" . $x . $y));
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

function qm_verify_admin_update(string $challengeId, string $nonce, string $jwks, string $signature): void
{
    if (!preg_match('/^[A-Za-z0-9_-]{86}$/D', $signature)) {
        throw new QuestionApiError(401, 'Administrator signature invalid');
    }
    $raw = qm_b64url_decode($signature);
    if (strlen($raw) !== 64) throw new QuestionApiError(401, 'Administrator signature invalid');
    $derSignature = qm_der(0x30, qm_der_integer(substr($raw, 0, 32))
        . qm_der_integer(substr($raw, 32, 32)));
    $message = "cc98-jwks-update-v1\n" . $challengeId . "\n" . $nonce . "\n" . hash('sha256', $jwks);
    $verified = openssl_verify($message, $derSignature, qm_admin_pem(qm_config()['admin_public_jwk']),
        OPENSSL_ALGO_SHA256);
    if ($verified !== 1) throw new QuestionApiError(401, 'Administrator signature invalid');
}

function qm_jwks(string $raw): array
{
    if (strlen($raw) > 12000) throw new QuestionApiError(503, 'OpenID provider unavailable');
    $parsed = json_decode($raw, true, 16);
    if (!is_array($parsed) || !isset($parsed['keys']) || !is_array($parsed['keys'])
        || count($parsed['keys']) < 1 || count($parsed['keys']) > 8) {
        throw new QuestionApiError(503, 'OpenID provider unavailable');
    }
    $seen = [];
    foreach ($parsed['keys'] as $key) {
        if (!is_array($key) || array_diff(array_keys($key), ['kty', 'use', 'kid', 'e', 'n', 'alg'])
            || ($key['kty'] ?? null) !== 'RSA' || ($key['use'] ?? null) !== 'sig'
            || ($key['alg'] ?? null) !== 'RS256'
            || !is_string($key['kid'] ?? null) || !preg_match('/^[A-Za-z0-9_-]{1,128}$/D', $key['kid'])
            || !is_string($key['e'] ?? null) || !preg_match('/^[A-Za-z0-9_-]{2,16}$/D', $key['e'])
            || !is_string($key['n'] ?? null) || !preg_match('/^[A-Za-z0-9_-]{340,1400}$/D', $key['n'])
            || isset($seen[$key['kid']])) {
            throw new QuestionApiError(503, 'OpenID provider unavailable');
        }
        $seen[$key['kid']] = true;
    }
    return $parsed['keys'];
}

function qm_active_jwks(): array
{
    $row = qm_db()->query('SELECT jwks_json FROM question_jwks WHERE id = 1')->fetchColumn();
    $raw = is_string($row) ? $row : (qm_config()['pinned_jwks'] ?? '');
    return qm_jwks($raw);
}

function qm_verify_cc98_token($token, string $nonce): string
{
    if (!is_string($token) || strlen($token) > 6000 || $nonce === '') {
        throw new QuestionApiError(401, 'OpenID validation failed');
    }
    $parts = explode('.', $token);
    if (count($parts) !== 3) throw new QuestionApiError(401, 'OpenID validation failed');
    $header = json_decode(qm_b64url_decode($parts[0]), true, 8);
    $payload = json_decode(qm_b64url_decode($parts[1]), true, 16);
    if (!is_array($header) || !is_array($payload) || ($header['alg'] ?? null) !== 'RS256'
        || !is_string($header['kid'] ?? null)) {
        throw new QuestionApiError(401, 'OpenID validation failed');
    }
    $key = null;
    foreach (qm_active_jwks() as $candidate) {
        if ($candidate['kid'] === $header['kid']) {
            $key = $candidate;
            break;
        }
    }
    if ($key === null) throw new QuestionApiError(401, 'OpenID validation failed');
    $verified = openssl_verify($parts[0] . '.' . $parts[1], qm_b64url_decode($parts[2]),
        qm_rsa_pem($key), OPENSSL_ALGO_SHA256);
    if ($verified !== 1) throw new QuestionApiError(401, 'OpenID validation failed');
    $audience = '9ca359c2-4112-44de-6177-08debd80dfb1';
    $aud = $payload['aud'] ?? null;
    $audValid = $aud === $audience || (is_array($aud) && in_array($audience, $aud, true));
    $now = time();
    if (($payload['iss'] ?? null) !== 'https://openid.cc98.org' || !$audValid
        || (is_array($aud) && count($aud) > 1 && ($payload['azp'] ?? null) !== $audience)
        || (isset($payload['azp']) && $payload['azp'] !== $audience)
        || !is_int($payload['exp'] ?? null) || !is_int($payload['iat'] ?? null)
        || $payload['exp'] <= $now - 30 || $payload['iat'] > $now + 30
        || $payload['iat'] < $now - 630
        || (isset($payload['nbf']) && (!is_int($payload['nbf']) || $payload['nbf'] > $now + 30))
        || ($payload['nonce'] ?? null) !== $nonce
        || !is_string($payload['sub'] ?? null) || $payload['sub'] === '') {
        throw new QuestionApiError(401, 'OpenID validation failed');
    }
    return $payload['sub'];
}

function qm_consume_challenge(string $id): string
{
    $hash = hash('sha256', $id);
    $now = qm_now_ms();
    $stmt = qm_db()->prepare('SELECT nonce FROM question_challenges WHERE id_hash = ? AND expires_at > ?');
    $stmt->execute([$hash, $now]);
    $nonce = $stmt->fetchColumn();
    if (!is_string($nonce)) throw new QuestionApiError(401, 'Challenge expired');
    $stmt = qm_db()->prepare('DELETE FROM question_challenges WHERE id_hash = ? AND nonce = ? AND expires_at > ?');
    $stmt->execute([$hash, $nonce, $now]);
    if ($stmt->rowCount() !== 1) throw new QuestionApiError(401, 'Challenge expired');
    return $nonce;
}

function qm_route_api(string $path, string $method): void
{
    if ($path === '/api/health' && $method === 'GET') {
        http_response_code(204);
        header('Cache-Control: no-store');
        return;
    }
    if ($path === '/api/questions' && ($method === 'GET' || $method === 'POST')) {
        qm_json(['error' => 'Legacy demo endpoint retired'], 410);
        return;
    }
    $postRoutes = ['/api/auth/challenge', '/api/auth/session', '/api/questions/batch',
        '/api/questions/toggle', '/api/admin/jwks-update'];
    if (!in_array($path, $postRoutes, true)) {
        qm_json(['error' => 'Not found'], 404);
        return;
    }
    if ($method === 'OPTIONS') {
        qm_options();
        return;
    }
    if ($method !== 'POST') {
        qm_json(['error' => 'Method not allowed'], 405);
        return;
    }
    qm_assert_origin();
    if ($path === '/api/auth/challenge') {
        qm_rate_limit('challenge', 20);
        $id = qm_token(16);
        $nonce = qm_token(24);
        $stmt = qm_db()->prepare('INSERT INTO question_challenges (id_hash, nonce, expires_at) VALUES (?, ?, ?)');
        $stmt->execute([hash('sha256', $id), $nonce, qm_now_ms() + 300000]);
        qm_json(['id' => $id, 'nonce' => $nonce]);
        return;
    }
    if ($path === '/api/auth/session') {
        qm_rate_limit('session', 20);
        $body = qm_body();
        if (!qm_only_fields($body, ['challengeId', 'idToken'])
            || !is_string($body['challengeId'])
            || !preg_match('/^[A-Za-z0-9_-]{22}$/D', $body['challengeId'])) {
            throw new QuestionApiError(400, 'Invalid authentication request');
        }
        $nonce = qm_consume_challenge($body['challengeId']);
        $subject = qm_verify_cc98_token($body['idToken'], $nonce);
        $token = qm_token(32);
        $expires = qm_now_ms() + 900000;
        $stmt = qm_db()->prepare('INSERT INTO question_sessions (token_hash, subject_hash, expires_at) VALUES (?, ?, ?)');
        $stmt->execute([hash('sha256', $token), qm_subject_hash($subject), $expires]);
        qm_json(['token' => $token, 'expiresAt' => $expires]);
        return;
    }
    if ($path === '/api/admin/jwks-update') {
        qm_rate_limit('admin-jwks', 10);
        if (empty(qm_config()['admin_public_jwk'])) {
            throw new QuestionApiError(503, 'Trusted key updater is not enrolled');
        }
        $body = qm_body();
        if (!qm_only_fields($body, ['challengeId', 'jwks', 'signature'])
            || !is_string($body['challengeId'])
            || !preg_match('/^[A-Za-z0-9_-]{22}$/D', $body['challengeId'])
            || !is_string($body['jwks']) || !is_string($body['signature'])) {
            throw new QuestionApiError(400, 'Invalid key update request');
        }
        $nonce = qm_consume_challenge($body['challengeId']);
        qm_verify_admin_update($body['challengeId'], $nonce, $body['jwks'], $body['signature']);
        $next = qm_jwks($body['jwks']);
        $current = qm_active_jwks();
        $overlap = false;
        foreach ($next as $newKey) {
            foreach ($current as $oldKey) {
                if ($newKey['kid'] === $oldKey['kid']
                    && $newKey['n'] === $oldKey['n'] && $newKey['e'] === $oldKey['e']) {
                    $overlap = true;
                }
            }
        }
        if (!$overlap) throw new QuestionApiError(409, 'No overlap with current trusted keys; manual review required');
        $now = qm_now_ms();
        $stmt = qm_db()->prepare('INSERT OR REPLACE INTO question_jwks (id, jwks_json, updated_at) VALUES (1, ?, ?)');
        $stmt->execute([$body['jwks'], $now]);
        qm_json(['updatedAt' => $now, 'kids' => array_column($next, 'kid')]);
        return;
    }
    $subject = qm_require_session();
    if ($path === '/api/questions/batch') {
        qm_rate_limit('read:' . $subject, 180);
        $body = qm_body();
        if (!qm_only_fields($body, ['topicId', 'floors']) || !is_array($body['floors'])) {
            throw new QuestionApiError(400, 'Unexpected question fields');
        }
        $topic = qm_positive_int($body['topicId'], 1000000000);
        $floors = array_values(array_unique($body['floors'], SORT_REGULAR));
        if ($topic === null || count($floors) < 1 || count($floors) > 50) {
            throw new QuestionApiError(400, 'Invalid topic or floors');
        }
        foreach ($floors as $floor) {
            if (qm_positive_int($floor, 1000000) === null) {
                throw new QuestionApiError(400, 'Invalid topic or floors');
            }
        }
        $placeholders = implode(',', array_fill(0, count($floors), '?'));
        $stmt = qm_db()->prepare('SELECT floor, COUNT(*) AS count, MAX(CASE WHEN subject_hash = ? THEN 1 ELSE 0 END) AS mine '
            . 'FROM question_votes WHERE topic_id = ? AND floor IN (' . $placeholders . ') GROUP BY floor');
        $stmt->execute(array_merge([$subject, $topic], $floors));
        $items = [];
        foreach ($floors as $floor) $items[$floor] = ['count' => 0, 'mine' => false];
        while ($row = $stmt->fetch()) {
            $items[(int) $row['floor']] = ['count' => (int) $row['count'], 'mine' => (bool) $row['mine']];
        }
        qm_json(['items' => $items]);
        return;
    }
    qm_rate_limit('toggle:' . $subject, 30);
    $body = qm_body();
    if (!qm_only_fields($body, ['topicId', 'floor'])) {
        throw new QuestionApiError(400, 'Unexpected question fields');
    }
    $topic = qm_positive_int($body['topicId'], 1000000000);
    $floor = qm_positive_int($body['floor'], 1000000);
    if ($topic === null || $floor === null) {
        throw new QuestionApiError(400, 'Invalid topic or floor');
    }
    $db = qm_db();
    $db->beginTransaction();
    try {
        $stmt = $db->prepare('SELECT 1 FROM question_votes WHERE topic_id = ? AND floor = ? AND subject_hash = ?');
        $stmt->execute([$topic, $floor, $subject]);
        if ($stmt->fetchColumn()) {
            $stmt = $db->prepare('DELETE FROM question_votes WHERE topic_id = ? AND floor = ? AND subject_hash = ?');
            $stmt->execute([$topic, $floor, $subject]);
        } else {
            $stmt = $db->prepare('INSERT OR IGNORE INTO question_votes (topic_id, floor, subject_hash, created_at) VALUES (?, ?, ?, ?)');
            $stmt->execute([$topic, $floor, $subject, qm_now_ms()]);
        }
        $stmt = $db->prepare('SELECT COUNT(*) AS count, MAX(CASE WHEN subject_hash = ? THEN 1 ELSE 0 END) AS mine '
            . 'FROM question_votes WHERE topic_id = ? AND floor = ?');
        $stmt->execute([$subject, $topic, $floor]);
        $row = $stmt->fetch();
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
    qm_json(['count' => (int) $row['count'], 'mine' => (bool) $row['mine']]);
}
