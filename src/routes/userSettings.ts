import { Request, Response } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { userSettings } from "@shared/schema";

// Get user settings
export async function getUserSettings(req: Request, res: Response) {
  try {
    if (!req.user) {
      // Return default settings for non-authenticated users
      return res.json({
        theme: "system",
        language: "en",
        emailNotifications: true,
        smsNotifications: false,
        appNotifications: true,
        marketingEmails: true,
        orderUpdates: true,
        promotionAlerts: true,
        lowStockAlerts: false,
        stockUpdateNotifications: false,
      });
    }

    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, req.user.id));

    if (!settings) {
      // Create default settings for the user if none exist
      const [newSettings] = await db
        .insert(userSettings)
        .values({
          userId: req.user.id,
          theme: "system",
          language: "en",
          emailNotifications: true,
          smsNotifications: false,
          appNotifications: true,
          marketingEmails: true,
          orderUpdates: true,
          promotionAlerts: true,
          lowStockAlerts: false,
          stockUpdateNotifications: false,
        })
        .returning();

      return res.json(newSettings);
    }

    return res.json(settings);
  } catch (error) {
    console.error("Error fetching user settings:", error);
    return res.status(500).json({
      message: "Failed to load user settings",
      error: error.message,
    });
  }
}

// Update user settings
export async function updateUserSettings(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, req.user.id));

    if (!settings) {
      // Create new settings with provided data
      const [newSettings] = await db
        .insert(userSettings)
        .values({
          userId: req.user.id,
          ...req.body,
        })
        .returning();

      return res.json(newSettings);
    }

    // Update existing settings
    const [updatedSettings] = await db
      .update(userSettings)
      .set({
        ...req.body,
        updatedAt: new Date(),
      })
      .where(eq(userSettings.id, settings.id))
      .returning();

    return res.json(updatedSettings);
  } catch (error) {
    console.error("Error updating user settings:", error);
    return res.status(500).json({
      message: "Failed to update user settings",
      error: error.message,
    });
  }
}