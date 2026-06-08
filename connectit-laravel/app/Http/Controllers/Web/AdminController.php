<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\CompanyEmailConfig;
use Inertia\Inertia;
use Inertia\Response;

class AdminController extends Controller
{
    public function accessControl(): Response
    {
        return Inertia::render('AccessControl');
    }

    public function groups(): Response
    {
        return Inertia::render('Groups');
    }

    public function companies(): Response
    {
        return Inertia::render('Companies');
    }

    public function showCompany(string $id): Response
    {
        return Inertia::render('Companies', ['companyId' => $id]);
    }

    public function emailIntegrations(): Response
    {
        $configs = CompanyEmailConfig::orderByDesc('is_default')
            ->orderBy('company_name')
            ->get()
            ->map(fn ($c) => [
                'id'           => (string) $c->id,
                'company_name' => $c->company_name,
                'email_address'=> $c->email_address,
                'smtp_host'    => $c->smtp_host,
                'smtp_port'    => $c->smtp_port,
                'smtp_user'    => $c->smtp_user,
                'smtp_pass'    => $c->smtp_pass,
                'imap_host'    => $c->imap_host,
                'imap_port'    => $c->imap_port,
                'imap_user'    => $c->imap_user,
                'imap_pass'    => $c->imap_pass,
                'encryption'   => $c->encryption,
                'is_active'    => (int) $c->is_active,
                'is_default'   => (int) $c->is_default,
                'created_at'   => $c->created_at,
            ]);

        return Inertia::render('EmailIntegrations', ['configs' => $configs]);
    }

    public function m365Monitor(): Response
    {
        return Inertia::render('M365EmailMonitor');
    }
}
