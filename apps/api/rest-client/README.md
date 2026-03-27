# REST Client Requests

These `.http` files are meant for the VS Code REST Client extension.

Usage:
- Start the API with `npm run dev`.
- Open a `.http` file in this folder.
- Run the named login request near the top of that file first.
- Run the follow-up requests in the same file. They reuse the login response token with REST Client response variables.

Seeded defaults used by these files:
- Tenant slug: `seed-gym-1`
- Tenant id: `tenant_0001`
- Tenant admin: `admin.seed-gym-1@seed.gym.test`
- Coach: `coach.1.seed-gym-1@seed.gym.test`
- Member: `member.1.seed-gym-1@seed.gym.test`
- Shared password: `Test@1234`

Important:
- Most tenant-scoped endpoints use the raw tenant id like `tenant_0001`.
- Public endpoints use the tenant slug like `seed-gym-1`.
- The tenant controller currently mixes slug-based and id-based lookups, so the tenant request file includes both variables and notes where each one is used.
- Upload requests use `rest-client/fixtures/1x1.png` and require a working `R2_PUBLIC_URL` plus bucket binding.
