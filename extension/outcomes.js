/**
 * Bid outcome tracking: what Freelancer says happened to a bid after it was placed.
 *
 * Mapped from the account's own bids (/projects/0.1/bids?bidders[]=me) joined with the
 * project state. A won bid carries award_status "awarded"; a lost one has no award status
 * on a project whose sub_status is "closed_awarded". Requires a Freelancer session, so it
 * runs in the extension and reports to the dashboard.
 */

export function buildMyBidsUrl(myUserId, projectIds) {
  const params = new URLSearchParams({ compact: 'true', new_errors: 'true', project_details: 'true' });
  params.append('bidders[]', String(myUserId));
  for (const id of projectIds) params.append('projects[]', String(id));
  return `https://www.freelancer.com/api/projects/0.1/bids?${params.toString()}`;
}

/**
 * Derive one outcome from a bid record and its project record.
 */
export function deriveOutcome(bid, project) {
  if (!bid) return 'pending';
  if (bid.retracted) return 'retracted';

  const award = String(bid.award_status || '').toLowerCase();
  if (award === 'awarded' || award === 'accepted') return 'won';

  const status = String(project?.status || '').toLowerCase();
  const sub = String(project?.sub_status || '').toLowerCase();

  if (status === 'closed' || status === 'frozen') {
    return sub === 'closed_awarded' ? 'lost' : 'closed';
  }
  return 'pending';
}

/**
 * Turn a bids API response into { [projectId]: { outcome, bidId, paidStatus, amount } }.
 */
export function mapOutcomes(apiResult) {
  const bids = (apiResult && apiResult.bids) || [];
  const projects = (apiResult && apiResult.projects) || {};
  const out = {};
  for (const bid of bids) {
    const project = projects[bid.project_id];
    out[String(bid.project_id)] = {
      outcome: deriveOutcome(bid, project),
      bidId: bid.id,
      paidStatus: bid.paid_status || null,
      amount: bid.amount,
      period: bid.period,
      projectStatus: project ? `${project.status}${project.sub_status ? '/' + project.sub_status : ''}` : null,
    };
  }
  return out;
}

// Won and lost are final. Pending, closed and retracted are re-checked on each sync
// because a closed project can still be awarded later.
export function isFinalOutcome(outcome) {
  return outcome === 'won' || outcome === 'lost';
}
