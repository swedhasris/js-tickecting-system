<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use Inertia\Inertia;
use Inertia\Response;

class SettingsController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Settings');
    }

    public function branding(): Response
    {
        return Inertia::render('BrandingSettings');
    }

    public function customDropdowns(): Response
    {
        return Inertia::render('CustomDropdownManager');
    }

    public function incidentCategories(): Response
    {
        return Inertia::render('IncidentCategoryManagement');
    }
}
