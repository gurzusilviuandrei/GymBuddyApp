import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The weekly database backup holds every member's email and password hash. These checks keep
// the workflow from ever uploading or printing it unencrypted.
const workflow = readFileSync(join(process.cwd(), ".github/workflows/backup.yml"), "utf8");

describe("the weekly backup workflow", () => {
  it("runs every week and can be started by hand", () => {
    expect(workflow).toMatch(/cron: "0 3 \* \* 0"/);
    expect(workflow).toContain("workflow_dispatch");
  });

  it("takes the connection string and passphrase only from repository secrets", () => {
    expect(workflow).toContain("${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).toContain("${{ secrets.BACKUP_PASSPHRASE }}");
    // No real connection string (a host after "://"); the "postgres://*" pattern in the check is fine.
    expect(workflow).not.toMatch(/postgres(ql)?:\/\/[\w.-]+[:@]/);
  });

  it("encrypts before uploading, uploads only the encrypted file and deletes the plain dump", () => {
    expect(workflow).toMatch(/gpg [^\n]*--symmetric --cipher-algo AES256/);
    expect(workflow).toMatch(/rm -f "\$RUNNER_TEMP\/\$name\.dump"/);
    const uploads = [...workflow.matchAll(/path: (.+)/g)].map((m) => m[1]!.trim());
    expect(uploads.length).toBeGreaterThan(0);
    for (const path of uploads) expect(path.endsWith(".dump.gpg"), path).toBe(true);
  });

  it("refuses a passphrase that is a pasted connection string or too short", () => {
    expect(workflow).toContain("postgres://*|postgresql://*)");
    expect(workflow).toMatch(/BACKUP_PASSPHRASE}" -lt 16/);
  });

  it("never prints the connection string or passphrase", () => {
    expect(workflow).not.toMatch(/echo[^\n]*\$(SUPABASE_DB_URL|BACKUP_PASSPHRASE)/);
  });
});
