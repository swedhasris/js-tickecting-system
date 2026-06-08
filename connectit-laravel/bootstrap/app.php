<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use App\Http\Middleware\HandleInertiaRequests;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Inertia middleware — shares auth user + Ziggy routes with every page
        $middleware->web(append: [
            HandleInertiaRequests::class,
        ]);

        // Register role alias
        $middleware->alias([
            'role' => \App\Http\Middleware\CheckRole::class,
        ]);

        // CSRF exceptions for webhooks and public APIs
        $middleware->validateCsrfTokens(except: [
            'api/*',
            'webhooks/*',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Return JSON for API routes, Inertia error page for web routes
        $exceptions->respond(function (\Illuminate\Http\Response $response) {
            if ($response->status() === 419) {
                return back()->with('error', 'Session expired. Please refresh and try again.');
            }
            return $response;
        });
    })->create();
