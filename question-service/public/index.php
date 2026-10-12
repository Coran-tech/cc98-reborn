<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/QuestionService.php';

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if (strncmp($path, '/api/', 5) === 0) {
    try {
        qm_route_api($path, $method);
    } catch (QuestionApiError $error) {
        qm_json(['error' => $error->getMessage()], $error->httpStatus);
    } catch (Throwable $error) {
        error_log('question_service_failure: ' . get_class($error));
        qm_json(['error' => 'Service temporarily unavailable'], 503);
    }
    exit;
}

if ($method !== 'GET' && $method !== 'HEAD') {
    http_response_code(405);
    exit;
}

header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if ($path === '/') {
    $total = null;
    try {
        $total = (int) qm_db()->query('SELECT COUNT(*) FROM question_votes')->fetchColumn();
    } catch (Throwable $error) {
        error_log('question_home_db_failure: ' . get_class($error));
    }
    require dirname(__DIR__) . '/views/home.php';
} elseif ($path === '/privacy') {
    require dirname(__DIR__) . '/views/privacy.php';
} else {
    http_response_code(404);
    require dirname(__DIR__) . '/views/not-found.php';
}
