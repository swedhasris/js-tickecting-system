<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use Inertia\Inertia;
use Inertia\Response;

class TimesheetController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Timesheet');
    }

    public function weekly(): Response
    {
        return Inertia::render('TimesheetWeekly');
    }

    public function reports(): Response
    {
        return Inertia::render('TimesheetReports');
    }

    public function approvals(): Response
    {
        return Inertia::render('TimesheetApprovals');
    }
}
