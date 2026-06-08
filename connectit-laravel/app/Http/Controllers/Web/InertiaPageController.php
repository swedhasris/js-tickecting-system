<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\KnowledgeArticle;
use App\Models\SlaPolicy;
use App\Models\Problem;
use App\Models\Change;
use App\Models\Asset;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Serves all Inertia pages that only need minimal initial data.
 * The React components fetch their own data via /api/* endpoints.
 */
class InertiaPageController extends Controller
{
    public function serviceCatalog(): Response
    {
        return Inertia::render('ServiceCatalog');
    }

    public function knowledgeBase(): Response
    {
        return Inertia::render('KnowledgeBase');
    }

    public function slaManagement(): Response
    {
        $policies = SlaPolicy::where('is_active', true)->orderBy('priority')->get();
        return Inertia::render('SLAManagement', ['policies' => $policies]);
    }

    public function globalHistory(): Response
    {
        return Inertia::render('GlobalHistory');
    }

    public function calendar(): Response
    {
        return Inertia::render('Calendar');
    }

    public function leaderboard(): Response
    {
        return Inertia::render('Leaderboard');
    }

    public function approvals(): Response
    {
        return Inertia::render('Approvals');
    }

    public function problemManagement(): Response
    {
        return Inertia::render('ProblemManagement');
    }

    public function changeManagement(): Response
    {
        return Inertia::render('ChangeManagement');
    }

    public function cmdb(): Response
    {
        return Inertia::render('CMDB');
    }

    public function conversations(): Response
    {
        return Inertia::render('Conversations');
    }

    public function dataAnalytics(): Response
    {
        return Inertia::render('DataAnalytics');
    }

    public function servicePortal(): Response
    {
        return Inertia::render('ServicePortal');
    }
}
