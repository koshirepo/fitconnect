-- The food library, and diet plans built from it.
--
-- `FoodItem` is the exercise library's counterpart: platform-owned, no
-- tenantId, one catalogue every gym reads. Each row states one serving
-- ("100 g", "1 piece") and what that serving holds. Calories, protein, carbs,
-- fat and fibre are required because a plan totals them; the rest are optional
-- because most nutrition tables do not give every one.
--
-- `DietPlan` and `DietPlanAssignment` mirror `WorkoutPlan` and its assignments:
-- a gym's own plans, written by staff and assigned to members, or written by a
-- member for themselves. Meals are JSON, and each food line keeps a copy of the
-- nutrients it was picked with, so a plan written today reads the same if the
-- library entry is corrected later.
--
-- The membership links cascade, unlike the workout tables, so deleting a member
-- removes their diet plans and assignments without the members module having
-- to clear them first.


-- CreateTable
CREATE TABLE "FoodItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "foodType" TEXT,
    "servingSize" REAL NOT NULL,
    "servingUnit" TEXT NOT NULL,
    "calories" REAL NOT NULL,
    "proteinGrams" REAL NOT NULL,
    "carbsGrams" REAL NOT NULL,
    "fatGrams" REAL NOT NULL,
    "fibreGrams" REAL NOT NULL,
    "sugarGrams" REAL,
    "saturatedFatGrams" REAL,
    "sodiumMg" REAL,
    "cholesterolMg" REAL,
    "potassiumMg" REAL,
    "calciumMg" REAL,
    "ironMg" REAL,
    "description" TEXT,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DietPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "goal" TEXT,
    "dietType" TEXT,
    "targetCalories" INTEGER,
    "meals" JSONB NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DietPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DietPlan_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "TenantMembership" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DietPlanAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DietPlanAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DietPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DietPlanAssignment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "TenantMembership" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FoodItem_slug_key" ON "FoodItem"("slug");

-- CreateIndex
CREATE INDEX "FoodItem_category_idx" ON "FoodItem"("category");

-- CreateIndex
CREATE INDEX "FoodItem_isActive_idx" ON "FoodItem"("isActive");

-- CreateIndex
CREATE INDEX "FoodItem_category_isActive_idx" ON "FoodItem"("category", "isActive");

-- CreateIndex
CREATE INDEX "DietPlan_tenantId_idx" ON "DietPlan"("tenantId");

-- CreateIndex
CREATE INDEX "DietPlan_creatorId_idx" ON "DietPlan"("creatorId");

-- CreateIndex
CREATE INDEX "DietPlanAssignment_membershipId_idx" ON "DietPlanAssignment"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "DietPlanAssignment_planId_membershipId_key" ON "DietPlanAssignment"("planId", "membershipId");

