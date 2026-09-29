<?php
// Copy to config.php outside the public directory; never commit the real secret.
return [
    'database_path' => '/srv/question-service/data/questions.sqlite',
    'hmac_secret' => 'REPLACE_WITH_THE_ORIGINAL_43_CHARACTER_BASE64URL_KEY',
    'pinned_jwks' => '',
    'admin_public_jwk' => '',
];
