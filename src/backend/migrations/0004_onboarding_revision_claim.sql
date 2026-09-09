ALTER TABLE onboarding_proposal
  ADD COLUMN claim_request_id text;

ALTER TABLE onboarding_proposal
  ADD CONSTRAINT onboarding_proposal_claim_request_id_length
    CHECK (
      claim_request_id IS NULL
      OR (
        char_length(claim_request_id) >= 8
        AND char_length(claim_request_id) <= 100
      )
    );
