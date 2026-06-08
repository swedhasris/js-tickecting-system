<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Ticket;
use App\Models\User;
use App\Models\SlaPolicy;
use App\Models\IncidentCategory;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class TicketWebController extends Controller
{
    public function index(Request $request): Response
    {
        $filter = $request->query('filter', 'all');
        $action = $request->query('action');

        $query = Ticket::query()->latest();

        $query = match ($filter) {
            'open'           => $query->open(),
            'assigned_to_me' => $query->assignedTo($request->user()->uid),
            'unassigned'     => $query->unassigned(),
            'resolved'       => $query->resolved(),
            default          => $query,
        };

        $tickets = $query->limit(200)->get()->map(fn ($t) => $this->serialize($t));

        $agents = User::whereIn('role', ['agent','admin','super_admin','ultra_super_admin','sub_admin'])
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id','uid','name','email','role']);

        $categories = IncidentCategory::where('status', 'Active')
            ->orderBy('name')
            ->get(['id','name']);

        return Inertia::render('Tickets', [
            'initialTickets' => $tickets,
            'agents'         => $agents,
            'categories'     => $categories,
            'filter'         => $filter,
            'action'         => $action,
        ]);
    }

    public function show(string $id): Response
    {
        $ticket = Ticket::with(['activities', 'history', 'attachments'])->findOrFail($id);

        $agents = User::whereIn('role', ['agent','admin','super_admin','ultra_super_admin','sub_admin'])
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id','uid','name','email','role']);

        $data = $ticket->toArray();
        $data['id'] = (string) $ticket->id;
        $data['activities'] = $ticket->activities->map(fn ($a) => [
            ...$a->toArray(),
            'id'        => (string) $a->id,
            'ticket_id' => (string) $a->ticket_id,
        ])->values();
        $data['history'] = $ticket->history->map(fn ($h) => [
            ...$h->toArray(),
            'id'        => (string) $h->id,
            'ticket_id' => (string) $h->ticket_id,
        ])->values();

        return Inertia::render('TicketDetail', [
            'ticket' => $data,
            'agents' => $agents,
        ]);
    }

    public function approved(): Response
    {
        $tickets = Ticket::resolved()->latest()->get()->map(fn ($t) => $this->serialize($t));

        return Inertia::render('ApprovedTickets', [
            'initialTickets' => $tickets,
        ]);
    }

    private function serialize(Ticket $ticket): array
    {
        $data = $ticket->toArray();
        $data['id'] = (string) $ticket->id;
        return $data;
    }
}
