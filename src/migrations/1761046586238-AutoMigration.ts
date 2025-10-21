import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1761046586238 implements MigrationInterface {
    name = 'AutoMigration1761046586238'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE call_status AS ENUM ('PENDING','IN_PROGRESS','COMPLETED','FAILED','EXPIRED')`);
    await queryRunner.query(`
      CREATE TABLE calls (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        to_phone text NOT NULL,
        script_id text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        status call_status NOT NULL DEFAULT 'PENDING',
        attempts int NOT NULL DEFAULT 0,
        last_error text,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        started_at timestamptz,
        ended_at timestamptz,
        next_run_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX calls_status_next_run_idx ON calls (status, next_run_at, created_at)`);

    // Per-phone single in-flight enforced by partial unique index:
    await queryRunner.query(`
      CREATE UNIQUE INDEX uniq_inprogress_per_phone
        ON calls (to_phone)
        WHERE status = 'IN_PROGRESS'
    `);

    await queryRunner.query(`
      CREATE TABLE provider_calls (
        provider_call_id uuid PRIMARY KEY,
        call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE provider_calls`);
    await queryRunner.query(`DROP INDEX IF EXISTS uniq_inprogress_per_phone`);
    await queryRunner.query(`DROP INDEX IF EXISTS calls_status_next_run_idx`);
    await queryRunner.query(`DROP TABLE calls`);
    await queryRunner.query(`DROP TYPE call_status`);
  }

}
