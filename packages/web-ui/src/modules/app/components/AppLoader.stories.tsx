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
  render: () => (
    <div className="flex h-screen w-full" role="status" aria-label="Loading application">
      <AppLoader />
    </div>
  ),
};
