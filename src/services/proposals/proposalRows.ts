// Reading proposals with their offer and merchant, and shaping them for the API (shared-types: Proposal, Pick).
import type { DbClient } from '../../models/db.js';
import type { DayOfWeek, OfferCategory, Pick, PickSource, Proposal, ProposalStatus, ConfirmSheet } from '../../shared/types.js';
import { roundScore } from '../matching/matcher.js';

export interface ProposalJoinedRow {
  id: string;
  session_id: string;
  appointment_id: string;
  offer_id: string;
  merchant_id: string;
  rank: number;
  score: number;
  reason: string;
  distance_meters: number;
  source: PickSource;
  status: ProposalStatus;
  confirm_token_hash: string | null;
  confirm_token_expires_at: Date | null;
  confirm_token_used_at: Date | null;
  created_at: Date;
  updated_at: Date;
  offer_title: string;
  price_cents: number;
  regular_price_cents: number | null;
  category: OfferCategory;
  valid_days: DayOfWeek[];
  valid_start_time: string;
  valid_end_time: string;
  is_deposit: boolean;
  merchant_name: string;
  merchant_is_sample: boolean;
  purchased: boolean;
}

const SELECT = `SELECT p.*, o.title AS offer_title, o.price_cents, o.regular_price_cents, o.category, o.valid_days,
  o.valid_start_time, o.valid_end_time, o.is_deposit, m.name AS merchant_name, m.is_sample AS merchant_is_sample,
  EXISTS (SELECT 1 FROM purchases u WHERE u.proposal_id = p.id AND u.status = 'completed') AS purchased
  FROM proposals p JOIN offers o ON o.id = p.offer_id JOIN merchants m ON m.id = p.merchant_id`;

export async function loadProposal(client: DbClient, sessionId: string, proposalId: string, forUpdate = false): Promise<ProposalJoinedRow | null> {
  const { rows } = await client.query<ProposalJoinedRow>(
    `${SELECT} WHERE p.id = $1 AND p.session_id = $2${forUpdate ? ' FOR UPDATE OF p' : ''}`,
    [proposalId, sessionId],
  );
  return rows[0] ?? null;
}

export async function loadAppointmentProposals(client: DbClient, sessionId: string, appointmentId: string): Promise<ProposalJoinedRow[]> {
  const { rows } = await client.query<ProposalJoinedRow>(
    `${SELECT} WHERE p.session_id = $1 AND p.appointment_id = $2 AND p.status <> 'expired' ORDER BY p.created_at DESC, p.rank`,
    [sessionId, appointmentId],
  );
  // The newest generation of proposals only (a generation is the set made by one run).
  if (rows.length === 0) return rows;
  const newest = rows[0].created_at.getTime();
  return rows.filter((r) => r.created_at.getTime() === newest).sort((a, b) => a.rank - b.rank);
}

export function toProposal(r: ProposalJoinedRow): Proposal {
  return {
    id: r.id,
    appointmentId: r.appointment_id,
    offerId: r.offer_id,
    merchantId: r.merchant_id,
    rank: r.rank,
    score: r.score,
    reason: r.reason,
    distanceMeters: r.distance_meters,
    source: r.source,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export function validWindow(r: { valid_days: DayOfWeek[]; valid_start_time: string; valid_end_time: string }) {
  return { validDays: r.valid_days, validStartTime: r.valid_start_time, validEndTime: r.valid_end_time };
}

export function toPick(r: ProposalJoinedRow): Pick {
  return {
    proposalId: r.id,
    merchantId: r.merchant_id,
    merchantName: r.merchant_name,
    merchantIsSample: r.merchant_is_sample,
    offerId: r.offer_id,
    offerTitle: r.offer_title,
    priceCents: r.price_cents,
    regularPriceCents: r.regular_price_cents,
    validWindow: validWindow(r),
    reason: r.reason,
    distanceMeters: r.distance_meters,
    score: roundScore(r.score),
    source: r.source,
    status: r.status,
    purchased: r.purchased,
  };
}

export function toConfirmSheet(r: ProposalJoinedRow): ConfirmSheet {
  return {
    proposalId: r.id,
    merchantName: r.merchant_name,
    merchantIsSample: r.merchant_is_sample,
    offerTitle: r.offer_title,
    priceCents: r.price_cents,
    validWindow: validWindow(r),
  };
}
