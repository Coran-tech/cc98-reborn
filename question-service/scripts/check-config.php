<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/QuestionService.php';

$config = qm_config();
if (!is_string($config['hmac_secret'] ?? null)
    || !preg_match('/^[A-Za-z0-9_-]{43}$/D', $config['hmac_secret'])) {
    throw new RuntimeException('HMAC configuration invalid');
}
$admin = openssl_pkey_get_public(qm_admin_pem((string) ($config['admin_public_jwk'] ?? '')));
if ($admin === false) {
    throw new RuntimeException('Administrator public key invalid');
}
$count = (int) qm_db()->query('SELECT COUNT(*) FROM question_votes')->fetchColumn();
qm_active_jwks();
echo "Configuration valid; migrated votes: {$count}\n";
