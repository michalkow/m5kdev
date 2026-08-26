import { useNotificationInbox } from "@m5kdev/frontend/modules/notification/hooks/useNotificationInbox";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export function NotificationInbox() {
  const { notifications, isLoading, markRead, isMarkingRead } = useNotificationInbox();

  if (isLoading) {
    return (
      <View style={styles.padded}>
        <Text style={styles.muted}>Loading notifications…</Text>
      </View>
    );
  }

  if (notifications.length === 0) {
    return (
      <View style={styles.padded}>
        <Text style={styles.muted}>No notifications yet</Text>
      </View>
    );
  }

  return (
    <ScrollView>
      {notifications.map((row) => {
        const unread = row.readAt == null;
        return (
          <Pressable
            key={row.id}
            disabled={!unread || isMarkingRead}
            onPress={() => {
              if (unread) markRead(row.id);
            }}
            style={styles.row}
          >
            <Text style={unread ? styles.unreadTitle : styles.readTitle}>{row.title}</Text>
            <Text style={styles.body}>{row.body}</Text>
            {unread ? <Text style={styles.hint}>Mark as read</Text> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  padded: { paddingVertical: 32 },
  muted: { fontSize: 14, color: "#737373" },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e5e5",
    paddingVertical: 12,
  },
  unreadTitle: { fontSize: 16, fontWeight: "600", color: "#171717" },
  readTitle: { fontSize: 16, color: "#525252" },
  body: { marginTop: 4, fontSize: 14, color: "#737373" },
  hint: { marginTop: 4, fontSize: 12, color: "#a3a3a3" },
});
