<?php
declare(strict_types=1);

function check(bool $condition, string $label): void
{
    if (!$condition) throw new RuntimeException($label);
}

function b64url(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

$base = sys_get_temp_dir() . '/question-selftest-' . bin2hex(random_bytes(6));
mkdir($base, 0700);
mkdir($base . '/src', 0700);
copy(dirname(__DIR__) . '/src/QuestionService.php', $base . '/src/QuestionService.php');
$secret = b64url(random_bytes(32));
$databasePath = $base . '/test.sqlite';
file_put_contents($base . '/config.php', '<?php return ' . var_export([
    'database_path' => $databasePath,
    'hmac_secret' => $secret,
    'pinned_jwks' => '',
    'admin_public_jwk' => '',
], true) . ';');

try {
    require $base . '/src/QuestionService.php';
    $db = qm_db();
    $db->exec(file_get_contents(dirname(__DIR__) . '/schema.sql'));
    check(strlen(qm_subject_hash('sample-user')) === 64, 'HMAC length');
    check(qm_subject_hash('sample-user') === hash_hmac('sha256', 'cc98-subject:sample-user',
        qm_b64url_decode($secret)), 'HMAC compatibility');

    $private = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
    check($private !== false, 'RSA test key');
    $details = openssl_pkey_get_details($private);
    $jwk = [
        'kty' => 'RSA', 'use' => 'sig', 'kid' => 'test-rsa', 'e' => b64url($details['rsa']['e']),
        'n' => b64url($details['rsa']['n']), 'alg' => 'RS256',
    ];
    $stmt = $db->prepare('INSERT INTO question_jwks (id, jwks_json, updated_at) VALUES (1, ?, ?)');
    $stmt->execute([json_encode(['keys' => [$jwk]]), qm_now_ms()]);
    $nonce = 'test-nonce';
    $payload = [
        'iss' => 'https://openid.cc98.org',
        'aud' => '9ca359c2-4112-44de-6177-08debd80dfb1',
        'iat' => time(), 'exp' => time() + 300, 'nonce' => $nonce, 'sub' => 'sample-user',
    ];
    $header = ['alg' => 'RS256', 'kid' => 'test-rsa', 'typ' => 'JWT'];
    $signed = b64url(json_encode($header)) . '.' . b64url(json_encode($payload));
    openssl_sign($signed, $signature, $private, OPENSSL_ALGO_SHA256);
    $jwt = $signed . '.' . b64url($signature);
    check(qm_verify_cc98_token($jwt, $nonce) === 'sample-user', 'valid OpenID signature');
    $rejected = false;
    try {
        qm_verify_cc98_token($jwt, 'different-nonce');
    } catch (QuestionApiError $error) {
        $rejected = $error->httpStatus === 401;
    }
    check($rejected, 'wrong nonce must be rejected');
    $rejected = false;
    try {
        qm_verify_cc98_token(substr($jwt, 0, -1) . (substr($jwt, -1) === 'A' ? 'B' : 'A'), $nonce);
    } catch (QuestionApiError $error) {
        $rejected = $error->httpStatus === 401;
    }
    check($rejected, 'altered signature must be rejected');
    echo "Question service self-test passed\n";
} finally {
    foreach (glob($base . '/*') ?: [] as $path) {
        if (is_dir($path)) {
            foreach (glob($path . '/*') ?: [] as $file) unlink($file);
            rmdir($path);
        } else {
            unlink($path);
        }
    }
    rmdir($base);
}
