import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError, allowedTransitions, assertTransition, canTransition, hasPermission, isDonatable, isPubliclyVisible, permissionsFor } from '../src/index';

describe('case lifecycle', () => {
  const auditor = permissionsFor(['field_auditor']);
  const moderator = permissionsFor(['content_moderator']);
  const finance = permissionsFor(['financial_officer']);
  const admin = permissionsFor(['super_admin']);

  it('lets each role perform only its own step', () => {
    assert.equal(canTransition('under_review', 'field_verified', auditor), true);
    assert.equal(canTransition('under_review', 'field_verified', moderator), false);
    assert.equal(canTransition('field_verified', 'published', moderator), true);
    assert.equal(canTransition('field_verified', 'published', auditor), false);
    assert.equal(canTransition('funded', 'closed', finance), true);
    assert.equal(canTransition('funded', 'closed', moderator), false);
  });

  it('reserves published → funded for the platform itself', () => {
    assert.equal(canTransition('published', 'funded', admin), false);
    assert.equal(canTransition('published', 'funded', 'system'), true);
  });

  it('rejects unknown jumps and requires reasons where configured', () => {
    assert.throws(
      () => assertTransition('draft', 'published', admin),
      (error) => DomainError.is(error, 'INVALID_TRANSITION'),
    );
    assert.throws(
      () => assertTransition('published', 'paused', moderator, '  '),
      (error) => DomainError.is(error, 'REASON_REQUIRED'),
    );
    assert.equal(assertTransition('published', 'paused', moderator, 'Awaiting updated hospital quote').to, 'paused');
    assert.throws(
      () => assertTransition('published', 'paused', auditor, 'x'),
      (error) => DomainError.is(error, 'FORBIDDEN_TRANSITION'),
    );
  });

  it('lists the actions a role can take from a status', () => {
    assert.deepEqual(
      allowedTransitions('under_review', auditor)
        .map((rule) => rule.to)
        .sort(),
      ['draft', 'field_verified', 'rejected'],
    );
    assert.deepEqual(
      allowedTransitions('published', finance).map((rule) => rule.to),
      ['closed'],
    );
  });

  it('accepts donations only while published', () => {
    assert.equal(isDonatable('published'), true);
    assert.equal(isDonatable('paused'), false);
    assert.equal(isDonatable('funded'), false);
    assert.equal(isPubliclyVisible('funded'), true);
    assert.equal(isPubliclyVisible('under_review'), false);
  });
});

describe('rbac', () => {
  it('grants super admins everything and donors nothing', () => {
    assert.equal(hasPermission(['super_admin'], 'finance:approve'), true);
    assert.equal(hasPermission(['donor'], 'cases:read'), false);
  });

  it('keeps money out of moderators’ hands and content out of finance’s', () => {
    assert.equal(hasPermission(['content_moderator'], 'finance:payouts'), false);
    assert.equal(hasPermission(['financial_officer'], 'cases:publish'), false);
    assert.equal(hasPermission(['field_auditor'], 'documents:read_private'), true);
  });

  it('unions permissions across roles', () => {
    const combined = permissionsFor(['field_auditor', 'financial_officer']);
    assert.ok(combined.has('cases:verify'));
    assert.ok(combined.has('finance:refunds'));
    assert.ok(!combined.has('team:manage'));
  });
});
