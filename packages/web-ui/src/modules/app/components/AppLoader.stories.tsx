import type { Meta, StoryObj } from "@storybook/react";

import { AppLoader } from "./AppLoader";

const meta = {
  title: "modules/app/AppLoader",
  component: AppLoader,
  tags: ["autodocs"],
} satisfies Meta<typeof AppLoader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  args: {
    "aria-label": "Loading application",
  },
};
