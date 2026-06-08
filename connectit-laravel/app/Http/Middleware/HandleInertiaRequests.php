<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;
use Tighten\Ziggy\Ziggy;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     * These are available on every Inertia page as page.props.
     */
    public function share(Request $request): array
    {
        $user = $request->user();

        return array_merge(parent::share($request), [
            'auth' => [
                'user' => $user ? [
                    'id'         => (string) $user->id,
                    'uid'        => $user->uid,
                    'name'       => $user->name,
                    'email'      => $user->email,
                    'role'       => is_object($user->role) ? $user->role->value : $user->role,
                    'phone'      => $user->phone,
                    'department' => $user->department,
                    'is_active'  => $user->is_active,
                    'photo_url'  => $user->photo_url,
                ] : null,
            ],
            'ziggy' => fn () => [
                ...(new Ziggy)->toArray(),
                'location' => $request->url(),
            ],
            'flash' => [
                'success' => $request->session()->get('success'),
                'error'   => $request->session()->get('error'),
            ],
            'appName' => config('app.name', 'TechnoSprint Ticketing'),
        ]);
    }
}
