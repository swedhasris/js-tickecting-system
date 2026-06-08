<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Ticket;
use App\Models\User;
use App\Models\SlaPolicy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $role = is_object($user->role) ? $user->role->value : $user->role;
        $isAgent = in_array($role, ['agent', 'admin', 'super_admin', 'ultra_super_admin', 'sub_admin']);

        if (!$isAgent) {
            return Inertia::render('ServicePortal');
        }

        // Dashboard stats — all in one optimised query
        $stats = [
            'open'          => Ticket::open()->count(),
            'unassigned'    => Ticket::unassigned()->count(),
            'resolved_today'=> Ticket::resolved()->whereDate('resolved_at', today())->count(),
            'critical'      => Ticket::open()->where('priority', '1 - Critical')->count(),
            'sla_breached'  => Ticket::open()->where('resolution_sla_status', 'Breached')->count(),
            'total_agents'  => User::whereIn('role', ['agent','admin','super_admin','ultra_super_admin'])->count(),
        ];

        // Recent tickets for dashboard table
        $recentTickets = Ticket::open()
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn ($t) => $this->serializeTicket($t));

        // Leaderboard
        $leaderboard = Ticket::resolved()
            ->whereDate('resolved_at', '>=', now()->subDays(7))
            ->whereNotNull('assigned_to')
            ->select('assigned_to', 'assigned_to_name', DB::raw('SUM(points) as total_points'), DB::raw('COUNT(*) as resolved_count'))
            ->groupBy('assigned_to', 'assigned_to_name')
            ->orderByDesc('total_points')
            ->limit(5)
            ->get();

        return Inertia::render('Dashboard', [
            'stats'         => $stats,
            'recentTickets' => $recentTickets,
            'leaderboard'   => $leaderboard,
        ]);
    }

    public function myDashboard(Request $request): Response
    {
        $user = $request->user();

        $myTickets = Ticket::assignedTo($user->uid)
            ->open()
            ->latest()
            ->limit(20)
            ->get()
            ->map(fn ($t) => $this->serializeTicket($t));

        $myStats = [
            'assigned'      => Ticket::assignedTo($user->uid)->open()->count(),
            'resolved_week' => Ticket::assignedTo($user->uid)->resolved()->whereDate('resolved_at', '>=', now()->subDays(7))->count(),
            'sla_at_risk'   => Ticket::assignedTo($user->uid)->open()->where('resolution_sla_status', 'At Risk')->count(),
            'points'        => Ticket::assignedTo($user->uid)->sum('points'),
        ];

        return Inertia::render('MyDashboard', [
            'myTickets' => $myTickets,
            'myStats'   => $myStats,
        ]);
    }

    private function serializeTicket(Ticket $ticket): array
    {
        $data = $ticket->toArray();
        $data['id'] = (string) $ticket->id;
        return $data;
    }
}
