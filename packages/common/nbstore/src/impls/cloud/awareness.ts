import type { SocketOptions } from 'socket.io-client';

import { share } from '../../connection';
import {
  type AwarenessRecord,
  AwarenessStorage,
  type AwarenessStorageOptions,
} from '../../storage/awareness';
import {
  base64ToUint8Array,
  SocketConnection,
  uint8ArrayToBase64,
} from './socket';

interface CloudAwarenessStorageOptions extends AwarenessStorageOptions {
  socketOptions: SocketOptions;
}

export class CloudAwarenessStorage extends AwarenessStorage<CloudAwarenessStorageOptions> {
  connection = share(
    new SocketConnection(this.peer, this.options.socketOptions)
  );

  private get socket() {
    return this.connection.inner;
  }

  override async update(record: AwarenessRecord): Promise<void> {
    const encodedUpdate = await uint8ArrayToBase64(record.bin);
    this.socket.emit('space:update-awareness', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      docId: record.docId,
      awarenessUpdate: encodedUpdate,
    });
  }

  override subscribeUpdate(
    id: string,
    onUpdate: (update: AwarenessRecord, origin?: string) => void,
    onCollect: () => AwarenessRecord
  ): () => void {
    // TODO: handle disconnect
    // leave awareness
    const leave = () => {
      this.socket.emit('space:leave-awareness', {
        spaceType: this.spaceType,
        spaceId: this.spaceId,
        docId: id,
      });
    };

    // join awareness, and collect awareness from others
    const joinAndCollect = async () => {
      await this.socket.emitWithAck('space:join-awareness', {
        spaceType: this.spaceType,
        spaceId: this.spaceId,
        docId: id,
        clientVersion: BUILD_CONFIG.appVersion,
      });
      this.socket.emit('space:load-awarenesses', {
        spaceType: this.spaceType,
        spaceId: this.spaceId,
        docId: id,
      });
    };

    joinAndCollect().catch(err => console.error('awareness join failed', err));

    const unsubscribeConnectionStatusChanged = this.connection.onStatusChanged(
      status => {
        if (status === 'connected') {
          joinAndCollect().catch(err =>
            console.error('awareness join failed', err)
          );
        }
      }
    );

    const handleCollectAwareness = ({
      spaceId,
      spaceType,
      docId,
    }: {
      spaceId: string;
      spaceType: string;
      docId: string;
    }) => {
      if (
        spaceId === this.spaceId &&
        spaceType === this.spaceType &&
        docId === id
      ) {
        (async () => {
          const record = onCollect();
          const encodedUpdate = await uint8ArrayToBase64(record.bin);
          this.socket.emit('space:update-awareness', {
            spaceType: this.spaceType,
            spaceId: this.spaceId,
            docId: record.docId,
            awarenessUpdate: encodedUpdate,
          });
        })().catch(err => console.error('awareness upload failed', err));
      }
    };

    const handleBroadcastAwarenessUpdate = ({
      spaceType,
      spaceId,
      docId,
      awarenessUpdate,
    }: {
      spaceType: string;
      spaceId: string;
      docId: string;
      awarenessUpdate: string;
    }) => {
      if (
        spaceId === this.spaceId &&
        spaceType === this.spaceType &&
        docId === id
      ) {
        onUpdate({
          bin: base64ToUint8Array(awarenessUpdate),
          docId: id,
        });
      }
    };

    this.socket.on('space:collect-awareness', handleCollectAwareness);
    this.socket.on(
      'space:broadcast-awareness-update',
      handleBroadcastAwarenessUpdate
    );
    return () => {
      leave();
      this.socket.off('space:collect-awareness', handleCollectAwareness);
      this.socket.off(
        'space:broadcast-awareness-update',
        handleBroadcastAwarenessUpdate
      );
      unsubscribeConnectionStatusChanged();
    };
  }
}
