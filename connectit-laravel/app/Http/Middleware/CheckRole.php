<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (!$user) {
            return $request->expectsJson()
                ? response()->json(['error' => 'Unauthenticated'], 401)
                : redirect()->route('login');
        }

        $userRole = is_object($user->role) ? $user->role->value : (string) $user->role;

        if (!in_array($userRole, $roles, true)) {
            return $request->expectsJson()
                ? response()->json(['error' => 'Forbidden'], 403)
                : abort(403, 'You do not have permission to access this page.');
        }

        return $next($request);
    }
}
